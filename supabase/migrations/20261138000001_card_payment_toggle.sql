-- KART ÖDEMESİ AÇ / KAPA (2026-10-23): Ayarlar › Ödeme Yöntemleri'ndeki "Kredi / Banka Kartı" artık gerçek seçenek.
-- Kapalıyken ödeme sayfasında kart görünmez ve iyzico başlatma reddedilir; açmak için sunucuda iyzico anahtarları
-- (IYZICO_API_KEY / IYZICO_SECRET_KEY / IYZICO_BASE_URL) tanımlı olmalı. Ödeme sayfası okuduğu için herkese açık sütun.
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS card_payment_enabled boolean NOT NULL DEFAULT false;
GRANT SELECT (card_payment_enabled) ON public.settings TO anon, authenticated;
