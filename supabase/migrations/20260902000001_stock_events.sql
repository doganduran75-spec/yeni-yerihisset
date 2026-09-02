-- ─────────────────────────────────────────────────────────────────────────────
-- F3: Stok-değişim olay altyapısı + admin manuel stok güncelleme RPC
--
-- Her stok değişimi stock_events'e kaydedilir. Bu tablo:
--   • denetim (kim, ne zaman, eski→yeni),
--   • ileride pazaryeri senkronu (F4) için "değişti, senkronla" kuyruğu
-- olarak kullanılır (synced = false olanlar işlenir).
--
-- admin_set_stock: admin panelinden stoğu tek çağrıda günceller + olay yazar.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.stock_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid REFERENCES products(id) ON DELETE CASCADE,
  variant_id  uuid REFERENCES product_variants(id) ON DELETE CASCADE,
  old_stock   integer,
  new_stock   integer,
  delta       integer,
  source      text NOT NULL DEFAULT 'admin_manual',  -- admin_manual | order_reduce | order_restore | import | ...
  changed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  synced      boolean NOT NULL DEFAULT false,         -- pazaryeri senkronu bekliyor mu
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_events_unsynced
  ON public.stock_events (synced, created_at) WHERE synced = false;
CREATE INDEX IF NOT EXISTS stock_events_variant
  ON public.stock_events (variant_id, created_at DESC);

ALTER TABLE public.stock_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin read stock_events" ON public.stock_events;
CREATE POLICY "admin read stock_events"
  ON public.stock_events FOR SELECT TO authenticated
  USING (public.is_admin());

-- ── Admin manuel stok güncelleme (güncelle + olay yaz, atomik) ────────────────
CREATE OR REPLACE FUNCTION public.admin_set_stock(
  p_product_id uuid,
  p_variant_id uuid,
  p_new_stock  integer,
  p_source     text DEFAULT 'admin_manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF p_new_stock IS NULL OR p_new_stock < 0 THEN
    RAISE EXCEPTION 'INVALID_STOCK';
  END IF;

  IF p_variant_id IS NOT NULL THEN
    SELECT stock INTO v_old FROM product_variants WHERE id = p_variant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'VARIANT_NOT_FOUND'; END IF;
    UPDATE product_variants SET stock = p_new_stock WHERE id = p_variant_id;
  ELSE
    SELECT stock INTO v_old FROM products WHERE id = p_product_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
    UPDATE products SET stock = p_new_stock WHERE id = p_product_id;
  END IF;

  INSERT INTO stock_events (product_id, variant_id, old_stock, new_stock, delta, source, changed_by)
  VALUES (p_product_id, p_variant_id, v_old, p_new_stock, p_new_stock - COALESCE(v_old, 0),
          COALESCE(NULLIF(p_source, ''), 'admin_manual'), auth.uid());

  RETURN jsonb_build_object('ok', true, 'old', v_old, 'new', p_new_stock);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_stock(uuid, uuid, integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_stock(uuid, uuid, integer, text) TO authenticated, service_role;
