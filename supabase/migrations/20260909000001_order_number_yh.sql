-- Sipariş numarası: order_number SADECE SAYI tutar (ör. 22559); arayüz başına
-- "YH" ekler → YH22559. (Mevcut kod zaten YH${order_number} gösteriyor.)
-- Sequence ile otomatik; her INSERT'te trigger set eder. Canlıya alırken eski
-- siparişler aktarıldıktan sonra sequence en yüksek numaradan devam edecek
-- şekilde güncellenir: SELECT setval('order_number_seq', <max+1>, false);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_number text;

-- Staging için 1000'den başlar; canlıda go-live'da setval ile güncellenecek.
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 1000;

CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := nextval('public.order_number_seq')::text;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_set_order_number ON public.orders;
CREATE TRIGGER trg_set_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_number();

-- Mevcut numarasızları oluşturma sırasına göre doldur
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.orders WHERE order_number IS NULL OR order_number = '' ORDER BY created_at LOOP
    UPDATE public.orders SET order_number = nextval('public.order_number_seq')::text WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_uidx
  ON public.orders(order_number) WHERE order_number IS NOT NULL;
