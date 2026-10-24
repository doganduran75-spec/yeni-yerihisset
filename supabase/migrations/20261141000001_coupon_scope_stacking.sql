-- KUPON TEMELİ (kullanıcı kararları 2026-10-24):
--   * Kapsam: kupon yalnız seçilen markalarda / kategorilerde geçerli olabilir (boş = hepsi). İndirim yalnız o
--     ürünlerin tutarı üzerinden; alt limit de o ürünlerin toplamına bakar (src/lib/coupon-rules.ts).
--   * Birden çok kupon aynı siparişte birleşir (aynı tür dahil): her kupon ayrı satır (order_coupons);
--     orders.coupon_id = ilk kupon, orders.coupon_discount = toplam indirim (eski raporlar / fatura bozulmasın).
--   * Tamamen iade edilen siparişte kullanılan kuponlar geri verilir (süresi kaldıysa kullanılabilir hâle gelir).
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS brand_ids    uuid[],
  ADD COLUMN IF NOT EXISTS category_ids uuid[];

CREATE TABLE IF NOT EXISTS public.order_coupons (
  order_id      uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  coupon_id     uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  discount      numeric NOT NULL DEFAULT 0,
  free_shipping boolean NOT NULL DEFAULT false,
  counted       boolean NOT NULL DEFAULT false,   -- kullanım sayıldı mı (havale: hemen; kart: ödeme onayında)
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, coupon_id)
);
ALTER TABLE public.order_coupons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_coupons FROM anon;
DROP POLICY IF EXISTS order_coupons_read ON public.order_coupons;
CREATE POLICY order_coupons_read ON public.order_coupons FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));
GRANT SELECT ON public.order_coupons TO authenticated;

-- Eski siparişler: tek kuponlu kayıtlar order_coupons'a (raporlar tek yerden okusun)
INSERT INTO public.order_coupons (order_id, coupon_id, discount, counted)
SELECT o.id, o.coupon_id, coalesce(o.coupon_discount, 0), true FROM public.orders o
 WHERE o.coupon_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Tam iade → kupon kullanımı geri (kişi + toplam sayaç), bir kez
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupons_restored_at timestamptz;

CREATE OR REPLACE FUNCTION public.order_restore_coupons_on_refund()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NEW.payment_status = 'refunded' AND OLD.payment_status IS DISTINCT FROM 'refunded' AND NEW.coupons_restored_at IS NULL THEN
    FOR r IN SELECT coupon_id FROM public.order_coupons WHERE order_id = NEW.id AND counted LOOP
      UPDATE public.coupons SET used_count = greatest(coalesce(used_count, 0) - 1, 0) WHERE id = r.coupon_id;
      UPDATE public.user_coupons SET use_count = greatest(coalesce(use_count, 0) - 1, 0)
       WHERE coupon_id = r.coupon_id AND user_id = NEW.user_id;
      UPDATE public.order_coupons SET counted = false WHERE order_id = NEW.id AND coupon_id = r.coupon_id;
    END LOOP;
    NEW.coupons_restored_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_order_restore_coupons ON public.orders;
CREATE TRIGGER trg_order_restore_coupons
  BEFORE UPDATE OF payment_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.order_restore_coupons_on_refund();

REVOKE ALL ON FUNCTION public.order_restore_coupons_on_refund() FROM PUBLIC, anon, authenticated;
