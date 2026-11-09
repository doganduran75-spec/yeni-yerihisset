-- Satış sonrası (oldu / değişim / iade): eski siteden aktarılmış siparişin TESLİMİ BU SİSTEMDE kaydedildiyse de (delivered_at) —
-- kargosu Kargonomi dışında (elle kod) yapılan ya da eski sitede sonradan "tamamlandı"ya geçen yeni siparişler (YH24395,
-- 2026-11-09: "Müşteri adına değişim / iade aç" sayfası açılmıyordu). Kural kodda: afterSaleHere() (src/lib/order-next-step.ts).
-- Teslim kaydı bu tetikleyicide yazıldığı için aktarılmış her site siparişi teslimde "deniyor" olur; aktarımdan önce teslim
-- edilmiş eski siparişler (delivered_at boş) etkilenmez.
CREATE OR REPLACE FUNCTION public.trg_orders_delivered()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.shipment_status = 'delivered' AND OLD.shipment_status IS DISTINCT FROM 'delivered' THEN
    NEW.delivered_at := coalesce(NEW.delivered_at, now());
    -- (eski kural: import_source IS NULL OR kargonomi_shipment_id / kargonomi_tracking_code — 20261170)
    IF coalesce(NEW.channel, 'site') = 'site' AND NEW.fit_status IS NULL THEN
      NEW.fit_status := 'trial';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Geriye dönük: teslimi bu sistemde kaydedilmiş, 14 günü dolmamış, cevapsız aktarılan site siparişleri
UPDATE public.orders
   SET fit_status = 'trial'
 WHERE coalesce(channel, 'site') = 'site'
   AND import_source IS NOT NULL
   AND shipment_status = 'delivered'
   AND status <> 'cancelled'
   AND fit_status IS NULL
   AND delivered_at IS NOT NULL
   AND delivered_at > now() - interval '14 days';
