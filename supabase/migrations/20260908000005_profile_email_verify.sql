-- E-posta doğrulama — KENDİ bayrağımız (GoTrue native confirm'e bağlı değil).
-- Hesap anında aktif (giriş her zaman çalışır, sürtünme yok); doğrulama
-- asenkron + admin'e görünür. Yeni üyeler false başlar; MEVCUT üyeler
-- grandfather (true) — hepsi "doğrulanmadı" görünmesin.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_verified      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verified_at   timestamptz,
  ADD COLUMN IF NOT EXISTS email_verify_token  text,
  ADD COLUMN IF NOT EXISTS email_verify_sent_at timestamptz;

-- Mevcut üyeleri doğrulanmış say (yalnız bu migration'dan öncekiler)
UPDATE public.profiles SET email_verified = true, email_verified_at = now()
WHERE email_verified = false;

-- Token ile hızlı arama
CREATE INDEX IF NOT EXISTS idx_profiles_email_verify_token
  ON public.profiles (email_verify_token) WHERE email_verify_token IS NOT NULL;
