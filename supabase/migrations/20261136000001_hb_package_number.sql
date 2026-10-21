-- Hepsiburada FATURA BAĞLANTISI paket numarasına gönderilir (sitedeki sipariş = HB sipariş numarası) → paket
-- numarası siparişe yazılır (src/lib/marketplace/hb-orders.ts). Var olan siparişler: aktarılan ham veriden.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS mp_package_number text;

UPDATE public.orders SET mp_package_number = external_raw->'package'->>'packageNumber'
 WHERE channel = 'hepsiburada' AND mp_package_number IS NULL
   AND coalesce(external_raw->'package'->>'packageNumber', '') <> '';
