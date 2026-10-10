-- SATIŞ SONRASI: "Ayakkabın oldu mu?" → Oldu / Değişim / İade (kullanıcı onaylı akış, 2026-10-10)
-- orders.fit_status : NULL (henüz teslim edilmedi) · trial (teslim edildi, müşteri deniyor) · ok (oldu) ·
--                     exchange (değişim sürüyor) · return (iade sürüyor)
-- orders.delivered_at: kargo "Teslim edildi" olduğu an (tetikleyici). 14 gün cevap yoksa "oldu" sayılır (uygulama).
-- order_cases: siparişin açık değişim/iade talebi (sipariş başına bir açık talep). Yalnız sunucu + yönetici.
--   exchange: requested → (waiting_stock) → alt_shipped → alt_delivered → keep_chosen → label_sent → resolved
--   return  : requested → label_sent → received
-- order_items.exchange_of: değişimde gönderilen alternatif ürünün hangi kalemin yerine gittiği.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fit_status text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS fit_answered_at timestamptz;

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS exchange_of uuid REFERENCES public.order_items(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.order_cases (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('exchange', 'return')),
  status         text NOT NULL,
  reason         text,
  customer_note  text,
  items          jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{order_item_id, want_variant_id, want_product_id, want_label, wait}]
  keep_item_id   uuid,                               -- değişimde müşterinin tuttuğu kalem
  return_method  text CHECK (return_method IN ('ups', 'surat', 'aras')),
  return_code    text,
  label_sent_at  timestamptz,
  alt_tracking   text,
  iban           text,                               -- havale iadesi için (yalnız yönetici görür)
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  closed_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_order_cases_order ON public.order_cases(order_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_cases_open ON public.order_cases(order_id) WHERE closed_at IS NULL;
ALTER TABLE public.order_cases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_cases FROM anon;
DROP POLICY IF EXISTS order_cases_admin ON public.order_cases;
CREATE POLICY order_cases_admin ON public.order_cases FOR SELECT TO authenticated USING (public.is_admin());
GRANT SELECT ON public.order_cases TO authenticated;

-- Teslim edildi → teslim tarihi + "deniyor" (site siparişi; pazaryeri ve aktarılan hariç)
CREATE OR REPLACE FUNCTION public.trg_orders_delivered()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.shipment_status = 'delivered' AND OLD.shipment_status IS DISTINCT FROM 'delivered' THEN
    NEW.delivered_at := coalesce(NEW.delivered_at, now());
    IF coalesce(NEW.channel, 'site') = 'site' AND NEW.import_source IS NULL AND NEW.fit_status IS NULL THEN
      NEW.fit_status := 'trial';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_orders_delivered ON public.orders;
CREATE TRIGGER trg_orders_delivered BEFORE UPDATE OF shipment_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_orders_delivered();

-- Değişim: alternatif ürünü siparişe ekle + stoğunu düş (yetmezse hata). Fiyat, yerine gittiği kalemin fiyatı.
CREATE OR REPLACE FUNCTION public.exchange_add_item(p_order uuid, p_from_item uuid, p_variant uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE src record; v record; new_id uuid;
BEGIN
  SELECT * INTO src FROM public.order_items WHERE id = p_from_item AND order_id = p_order;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kalem bulunamadı'; END IF;
  SELECT pv.id, pv.product_id, pv.stock, pv.sku, vo.value AS label
    INTO v FROM public.product_variants pv LEFT JOIN public.variant_options vo ON vo.id = pv.variant_option_id
   WHERE pv.id = p_variant FOR UPDATE OF pv;
  IF NOT FOUND THEN RAISE EXCEPTION 'Numara bulunamadı'; END IF;
  IF coalesce(v.stock, 0) < 1 THEN RAISE EXCEPTION 'Bu numara stokta yok'; END IF;
  UPDATE public.product_variants SET stock = stock - 1 WHERE id = p_variant;
  INSERT INTO public.order_items (order_id, product_id, variant_id, quantity, unit_price, sku, variant_name, exchange_of)
  VALUES (p_order, v.product_id, v.id, 1, src.unit_price, coalesce(v.sku, ''), coalesce(v.label, ''), p_from_item)
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.exchange_add_item(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exchange_add_item(uuid, uuid, uuid) TO service_role;

SELECT 'satış sonrası hazır' AS durum;
