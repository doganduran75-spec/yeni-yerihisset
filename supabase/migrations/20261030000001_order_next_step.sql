-- SİPARİŞ "SIRADAKİ ADIM" (admin paneli tek akış, 2026-10-10) — src/lib/order-next-step.ts
-- Pazaryeri iadesi stoğa eklendi mi? Liste ekranı ("Bekleyen işlerim") kalemleri yüklemeden bilsin diye
-- sipariş üzerinde işaret. restockReturnedOrder() doldurur; mevcutlar kalemlerden (stock_restored_at) doldurulur.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS mp_restocked_at timestamptz;

UPDATE public.orders o SET mp_restocked_at = now()
 WHERE o.mp_restocked_at IS NULL
   AND coalesce(o.channel, 'site') <> 'site' AND o.import_source IS NULL
   AND EXISTS (SELECT 1 FROM public.order_items i WHERE i.order_id = o.id)
   AND NOT EXISTS (SELECT 1 FROM public.order_items i WHERE i.order_id = o.id AND i.stock_applied_at IS NOT NULL AND i.stock_restored_at IS NULL);

SELECT count(*) FILTER (WHERE mp_restocked_at IS NOT NULL) AS stoga_eklenmis_pazaryeri FROM public.orders;
