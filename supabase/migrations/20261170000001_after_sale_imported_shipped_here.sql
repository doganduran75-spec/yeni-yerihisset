-- Satış sonrası (oldu / değişim / iade) eski siteden aktarılıp KARGOSU BURADAN (Kargonomi / Basit Kargo) yapılan siparişte de
-- (kullanıcı 2026-11-06: aktarılmış siparişin müşterisi değişim istedi, panelde yol yoktu). Kural kodda: afterSaleHere()
-- (src/lib/order-next-step.ts). Teslim edilince "deniyor" (fit_status = trial) olur → "Müşteri adına değişim / iade aç".
CREATE OR REPLACE FUNCTION public.trg_orders_delivered()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.shipment_status = 'delivered' AND OLD.shipment_status IS DISTINCT FROM 'delivered' THEN
    NEW.delivered_at := coalesce(NEW.delivered_at, now());
    IF coalesce(NEW.channel, 'site') = 'site'
       AND (NEW.import_source IS NULL OR NEW.kargonomi_shipment_id IS NOT NULL OR NEW.kargonomi_tracking_code IS NOT NULL)
       AND NEW.fit_status IS NULL THEN
      NEW.fit_status := 'trial';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Geriye dönük: deneme süresi (14 gün) dolmamış, kargosu buradan yapılmış, teslim edilmiş aktarılan siparişler
UPDATE public.orders
   SET fit_status = 'trial'
 WHERE coalesce(channel, 'site') = 'site'
   AND import_source IS NOT NULL
   AND (kargonomi_shipment_id IS NOT NULL OR kargonomi_tracking_code IS NOT NULL)
   AND shipment_status = 'delivered'
   AND status <> 'cancelled'
   AND fit_status IS NULL
   AND coalesce(delivered_at, now()) > now() - interval '14 days';
