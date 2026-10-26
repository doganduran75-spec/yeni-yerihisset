-- Hepsiburada sipariş tarihleri (2026-10-26): Hepsiburada tarihi saat dilimi belirtmeden TÜRKİYE saatiyle gönderiyor;
-- sunucu (CET) kendi saatiyle okuduğu için siparişler 1–2 saat ileri kaydolmuştu (regresyon: "gelecek tarihli sipariş").
-- Kod düzeltildi (src/lib/marketplace/hb-orders.ts); mevcut kayıtlar Hepsiburada'nın gönderdiği ham tarihten yeniden hesaplanır.
UPDATE public.orders o
   SET created_at = (x.d::timestamp AT TIME ZONE 'Europe/Istanbul')
  FROM (SELECT id, coalesce(external_raw->>'orderDate', external_raw->'item'->>'orderDate', external_raw->'package'->>'orderDate') AS d
          FROM public.orders WHERE channel = 'hepsiburada' AND external_raw IS NOT NULL) x
 WHERE o.id = x.id
   AND x.d ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$'
   AND o.created_at IS DISTINCT FROM (x.d::timestamp AT TIME ZONE 'Europe/Istanbul');
