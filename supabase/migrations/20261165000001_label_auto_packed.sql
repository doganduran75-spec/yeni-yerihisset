-- Kargo entegrasyonu (Kargonomi / Basit Kargo) ile kodu gelen site siparişinde etiket basılınca sipariş kendiliğinden
-- "Kargo hazırlandı" (packed_at) olur — "Paket hazır"a ayrıca basılmaz (kullanıcı 2026-11-03: entegrasyon varken elle iş en az).
-- Kurye alınca kargo firmasının "teslim sürecinde" durumu siparişi Kargoda yapar + e-posta (src/lib/kargonomi-flow.ts).
-- Yalnız: site / aktarılmış sipariş, ödemesi alınmış, iptal değil, henüz kargoda değil, basılan kod entegrasyonun kodu.

CREATE OR REPLACE FUNCTION public.orders_label_auto_packed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.packed_at IS NULL
     AND NEW.label_printed_code IS NOT NULL
     AND NEW.label_printed_code IS DISTINCT FROM OLD.label_printed_code
     AND NEW.kargonomi_tracking_code IS NOT NULL
     AND NEW.label_printed_code = NEW.kargonomi_tracking_code
     AND (coalesce(NEW.channel, 'site') = 'site' OR NEW.import_source IS NOT NULL)
     AND NEW.payment_status IN ('paid', 'partial_refund')
     AND coalesce(NEW.status, '') <> 'cancelled'
     AND coalesce(NEW.shipment_status, '') NOT IN ('shipped', 'delivered', 'undelivered', 'returned')
  THEN
    NEW.packed_at := now();
    INSERT INTO public.order_events (order_id, type, note, created_by)
    VALUES (NEW.id, 'note', 'Etiket basıldı — kargo hazırlandı, kurye bekleniyor', NULL);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.orders_label_auto_packed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_label_auto_packed ON public.orders;
CREATE TRIGGER trg_orders_label_auto_packed
  BEFORE UPDATE OF label_printed_code ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_label_auto_packed();
