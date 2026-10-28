-- Kargoya verilme anı (kullanıcı 2026-10-28: panoda "Faturası kesilmemiş" — kargolanmış ama faturası kesilmemiş
-- siparişler; VUK 7 gün kuralına göre teslimden (kargoya verilişten) 7 günü geçenler kırmızı).
-- Sevkiyat "Kargoda" / "Teslim edildi" olunca bir kez yazılır (site + pazaryeri senkronu).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipped_at timestamptz;

CREATE OR REPLACE FUNCTION public.orders_set_shipped_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.shipped_at IS NULL AND NEW.shipment_status IN ('shipped', 'delivered', 'undelivered', 'returned') THEN
    NEW.shipped_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_orders_shipped_at ON public.orders;
CREATE TRIGGER trg_orders_shipped_at BEFORE INSERT OR UPDATE OF shipment_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_set_shipped_at();

-- Mevcut kargolanmış siparişler: kesin an bilinmiyor → teslim tarihi, yoksa sipariş tarihi (temkinli)
UPDATE public.orders SET shipped_at = coalesce(delivered_at, created_at)
 WHERE shipped_at IS NULL AND shipment_status IN ('shipped', 'delivered', 'undelivered', 'returned');
