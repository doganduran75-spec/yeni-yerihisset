-- DEĞİŞİM GÖNDERİSİ KARGO ENTEGRASYONUNDAN (kullanıcı 2026-11-26): müşteri adına açılan değişimde yeni numaranın kargo
-- kodu elle girilmek yerine "Kargo kodu oluştur" ile Kargonomi / Basit Kargo'dan alınır, etiketi basılır.
-- Gönderi siparişin kendi gönderisinden (orders.kargonomi_*) AYRI tutulur — ilk gönderinin durumu / teslimi bozulmasın.
--   alt_shipment_id    : sağlayıcıdaki gönderi no      alt_kargo_api   : 'kargonomi' | 'basitkargo'
--   alt_label_code     : etikete basılan entegrasyon kodu (KSUR… / Basit Kargo kodu)
--   alt_tracking       : (mevcut) müşteriye giden takip no — firmanın kendi kodu gelince o olur
--   alt_kargo_provider : kargo firması (Sürat Kargo …)  alt_kargo_status / alt_kargo_error / alt_checked_at
--   alt_confirmed_at   : firma seçildi (çift onay kilidi)  alt_label_printed_at : etiket basıldı
-- Teslim edildi bilgisi gelince değişim "alternatif teslim edildi" olur + müşteriye "hangisi oldu?" e-postası (cron, 5 dk).
ALTER TABLE public.order_cases
  ADD COLUMN IF NOT EXISTS alt_shipment_id      text,
  ADD COLUMN IF NOT EXISTS alt_kargo_api        text,
  ADD COLUMN IF NOT EXISTS alt_label_code       text,
  ADD COLUMN IF NOT EXISTS alt_kargo_provider   text,
  ADD COLUMN IF NOT EXISTS alt_kargo_status     text,
  ADD COLUMN IF NOT EXISTS alt_kargo_error      text,
  ADD COLUMN IF NOT EXISTS alt_confirmed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS alt_checked_at       timestamptz,
  ADD COLUMN IF NOT EXISTS alt_label_printed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_order_cases_alt_shipment ON public.order_cases (alt_confirmed_at)
  WHERE alt_shipment_id IS NOT NULL AND closed_at IS NULL;

NOTIFY pgrst, 'reload schema';
