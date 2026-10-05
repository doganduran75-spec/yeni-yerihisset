-- ============================================================
-- "YH" sipariş numarası YALNIZ sitenin kendi siparişlerine
-- ============================================================
-- Trendyol, Hepsiburada, Attipas (ve ileride Ozon/Amazon…) siparişleri o kanalın kendi
-- numarasıyla görünür (orders.external_order_number); site sayacından numara almaz →
-- YH numaraları arada boşluk olmadan ilerler. Eski YeriHisset siparişleri (kanal "site")
-- kendi numaralarıyla kalır.

CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(NEW.channel, 'site') = 'site' AND (NEW.order_number IS NULL OR NEW.order_number = '') THEN
    NEW.order_number := nextval('public.order_number_seq')::text;
  END IF;
  RETURN NEW;
END; $$;

-- Mevcut pazaryeri / Attipas siparişlerinden site numarasını kaldır (kendi numaraları duruyor)
UPDATE public.orders SET order_number = NULL
 WHERE coalesce(channel, 'site') <> 'site' AND order_number IS NOT NULL;

SELECT channel, count(*) AS siparis, count(order_number) AS yh_numarali, count(external_order_number) AS kendi_numarali
FROM public.orders GROUP BY channel ORDER BY channel;
