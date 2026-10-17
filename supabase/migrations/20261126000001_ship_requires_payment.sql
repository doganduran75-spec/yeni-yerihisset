-- ============================================================
-- Ödeme alınmadan sevkiyat başlamaz (kullanıcı, 2026-10-17)
-- ============================================================
-- Site siparişinde kargo süreci (Hazırlanıyor / Kargoda / Teslim edildi) yalnız ödeme alınmışsa başlar.
-- Kapsam dışı: pazaryeri siparişleri (ödeme ve kargo pazaryerinde), eski siteden aktarılanlar (geçmiş kayıt).
-- "Ödendi" + "Hazırlanıyor" aynı anda yazılabilir (Ödeme alındı düğmesi). İptal / iade durumları serbest.
-- Yönetici elle sipariş açarken havaleyi "Bekleniyor" ile açar (eskiden "Hazırlanıyor" açılıyordu); öyle açılmış
-- ödemesiz siparişler "Bekleniyor"a çekilir. Kapıda ödeme sitede yok; eklenirse
-- buraya istisna olarak girer.
CREATE OR REPLACE FUNCTION public.guard_ship_before_payment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(NEW.channel, 'site') = 'site' AND NEW.import_source IS NULL
     AND NEW.shipment_status IS DISTINCT FROM OLD.shipment_status
     AND NEW.shipment_status IN ('preparing', 'shipped', 'delivered', 'undelivered')
     AND coalesce(NEW.payment_status, 'pending') NOT IN ('paid', 'partial_refund') THEN
    RAISE EXCEPTION 'PAYMENT_REQUIRED_TO_SHIP' USING HINT = 'Önce ödemeyi onayla (Ödeme alındı).';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_ship_before_payment ON public.orders;
CREATE TRIGGER trg_guard_ship_before_payment BEFORE UPDATE OF shipment_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_ship_before_payment();

UPDATE public.orders SET shipment_status = 'waiting'
 WHERE coalesce(channel, 'site') = 'site' AND import_source IS NULL AND shipment_status = 'preparing'
   AND coalesce(payment_status, 'pending') = 'pending' AND status <> 'cancelled';
