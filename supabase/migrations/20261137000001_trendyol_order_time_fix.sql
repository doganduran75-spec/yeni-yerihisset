-- TRENDYOL SİPARİŞ SAATİ DÜZELTMESİ (2026-10-21). Trendyol orderDate Türkiye saatiyle (GMT+3) yazılmış zaman
-- damgası; aktarımda gerçek ana çevrilmediği için kayıtlar 3 saat ileride kaldı (gece siparişi ertesi gün görünür,
-- Paraşüt "sipariş tarihi bugünden ileri olamaz" der). Yeni siparişler kodda düzeltildi (orders.ts); burada mevcut
-- kayıtlar Trendyol'un ham verisinden (external_raw.orderDate) yeniden hesaplanır → kaç kez çalışsa aynı sonuç.
UPDATE public.orders
   SET created_at = to_timestamp((external_raw->>'orderDate')::bigint / 1000.0) - interval '3 hours'
 WHERE channel = 'trendyol' AND import_source IS NULL
   AND coalesce(external_raw->>'orderDate', '') ~ '^[0-9]{10,13}$'
   AND created_at IS DISTINCT FROM to_timestamp((external_raw->>'orderDate')::bigint / 1000.0) - interval '3 hours';
