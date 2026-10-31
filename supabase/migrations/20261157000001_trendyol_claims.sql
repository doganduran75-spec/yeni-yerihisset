-- Trendyol İADE talepleri (Claims servisi; src/lib/marketplace/trendyol-claims.ts). Kısmi iade sipariş servisinde
-- görünmüyor (paket "Delivered" kalır) → talepler ayrı çekilir; birim başına bir kayıt (claimItems[].id).
-- Kullanıcı kararı 2026-10-31: iade siteden onaylanır (Trendyol'a onay + iade gelen satır + kısmi ciro düşümü).
CREATE TABLE IF NOT EXISTS public.mp_claim_items (
  id            text PRIMARY KEY,                    -- Trendyol talep kalemi (onayda claimLineItemIdList)
  channel       text NOT NULL DEFAULT 'trendyol',
  claim_id      text NOT NULL,
  claim_ref     text,                                -- talebin diğer kimliği (belgede claimId / id net değil)
  order_id      uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  status        text,                                -- Created / WaitingInAction / Accepted / Rejected / ...
  reason        text,
  customer_note text,
  claim_date    timestamptz,
  cargo_tracking text,
  cargo_provider text,
  last_modified timestamptz,
  approved_at   timestamptz,                         -- siteden Trendyol'a onay gönderildi
  approve_error text,
  received_at   timestamptz,                         -- sitede işlendi (iade geldi + ciro)
  auto_closed   boolean NOT NULL DEFAULT false,      -- eski yolla (tam iade) işlenmiş siparişte kendiliğinden kapandı
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mp_claim_items_order_idx ON public.mp_claim_items (order_id);
ALTER TABLE public.mp_claim_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mp_claim_items FROM anon, authenticated;
GRANT SELECT ON public.mp_claim_items TO authenticated;
DROP POLICY IF EXISTS mp_claim_items_admin_read ON public.mp_claim_items;
CREATE POLICY mp_claim_items_admin_read ON public.mp_claim_items FOR SELECT TO authenticated USING (public.is_admin());
GRANT ALL ON public.mp_claim_items TO service_role;

-- Siparişte özet (sıradaki adım + pano): in_transit / arrived / accepted / disputed / done
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS mp_claim_state text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS mp_claim_note text;

-- Kalem stok iadesi: kısmi iadede stoğa eklenen adet (restocked_qty) ikinci kez eklenmesin
-- (sonradan paket iptal / tam iade olursa yalnız kalan adet eklenir)
CREATE OR REPLACE FUNCTION public.mp_restore_item_stock(p_item_id uuid, p_source text DEFAULT 'marketplace_cancel')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  it record;
  v_cur int;
  q int;
BEGIN
  SELECT * INTO it FROM order_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF it.stock_applied_at IS NULL OR it.stock_restored_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'noop', true);
  END IF;
  q := it.quantity - coalesce(it.restocked_qty, 0);
  IF q <= 0 THEN
    UPDATE order_items SET stock_restored_at = now() WHERE id = p_item_id;
    RETURN jsonb_build_object('ok', true, 'noop', true);
  END IF;

  IF it.variant_id IS NOT NULL THEN
    SELECT stock INTO v_cur FROM product_variants WHERE id = it.variant_id FOR UPDATE;
    UPDATE product_variants SET stock = COALESCE(stock, 0) + q WHERE id = it.variant_id;
  ELSE
    SELECT stock INTO v_cur FROM products WHERE id = it.product_id FOR UPDATE;
    UPDATE products SET stock = COALESCE(stock, 0) + q WHERE id = it.product_id;
  END IF;
  v_cur := COALESCE(v_cur, 0);

  UPDATE order_items SET stock_restored_at = now(), restocked_qty = quantity WHERE id = p_item_id;
  INSERT INTO stock_events (product_id, variant_id, old_stock, new_stock, delta, source)
  VALUES (it.product_id, it.variant_id, v_cur, v_cur + q, q, p_source);

  RETURN jsonb_build_object('ok', true, 'restored', q);
END;
$$;
REVOKE ALL ON FUNCTION public.mp_restore_item_stock(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mp_restore_item_stock(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
