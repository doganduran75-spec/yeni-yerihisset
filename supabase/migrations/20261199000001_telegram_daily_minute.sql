-- TELEGRAM günlük özet: yarım saat adımlı saat (kullanıcı 2026-11-23: özet 10:00 yerine 08:30).
-- src/lib/telegram.ts (maybeDailySummary) + Ayarlar › Entegrasyonlar › Telegram (00 / 30 seçimi).
-- Yeni kolon anon'a açılmaz (settings kolon yetkileri: yalnız açıkça GRANT edilen kolonlar herkese açık).
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS telegram_daily_minute int NOT NULL DEFAULT 0
  CHECK (telegram_daily_minute IN (0, 30));
UPDATE public.settings SET telegram_daily_hour = 8, telegram_daily_minute = 30;
