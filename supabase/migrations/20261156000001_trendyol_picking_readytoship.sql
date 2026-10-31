-- Trendyol "İşleme al": durumu ReadyToShip olan paket (Trendyol panelinde "Yeni") ilerlemiş sanılıp atlanmıştı.
-- Bu paketlerin "işleme alındı" işareti kaldırılır → cron dakikada bir yeniden dener (hata olursa siparişte görünür).
UPDATE public.orders SET mp_picking_at = NULL, mp_picking_error = NULL
 WHERE channel = 'trendyol' AND external_status = 'ReadyToShip' AND mp_picking_at IS NOT NULL
   AND coalesce(shipment_status, 'waiting') NOT IN ('shipped', 'delivered', 'undelivered', 'returned');
