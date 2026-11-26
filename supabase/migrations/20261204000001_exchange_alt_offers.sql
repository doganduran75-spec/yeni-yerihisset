-- DEĞİŞİM GÖNDERİSİ — desi + teklif penceresi (kullanıcı 2026-11-26: "desi değişmeyebilir ama başka kargo firmasıyla
-- çalışmak isteyebilirim; ilk gönderim gibi desi yazma ve teklif isteme ekranı"). Taslak gönderinin desisi ve firma
-- teklifleri talepte tutulur (siparişteki kargonomi_desi / kargonomi_offers'ın karşılığı); onayda teklif buradan doğrulanır.
ALTER TABLE public.order_cases
  ADD COLUMN IF NOT EXISTS alt_desi   numeric,
  ADD COLUMN IF NOT EXISTS alt_offers jsonb;

NOTIFY pgrst, 'reload schema';
