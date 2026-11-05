-- Paraşüt yeni kimlik doğrulama (id.parasut.com, OAuth 2.0 Authorization Code + PKCE) — Paraşüt duyurusu 2026-11:
-- eski api.parasut.com/oauth client'ları 10 Aralık 2026'da kapanıyor; yeni client DevHub'dan alınır.
-- Geçiş paralel: yeni client girilip "Paraşüt ile bağlan" yapılana kadar eski bağlantı çalışır (parasut_auth.issuer).
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS parasut_v2_client_id text,      -- DevHub client_id
  ADD COLUMN IF NOT EXISTS parasut_v2_client_secret text;  -- DevHub client_secret (anon / authenticated'a GRANT yok)

ALTER TABLE public.parasut_auth
  ADD COLUMN IF NOT EXISTS issuer text,                 -- 'id' = id.parasut.com; boş = eski api.parasut.com/oauth
  ADD COLUMN IF NOT EXISTS refresh_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS pending_state text,          -- bağlanma isteği (PKCE): state + code_verifier + dönüş adresi
  ADD COLUMN IF NOT EXISTS pending_verifier text,
  ADD COLUMN IF NOT EXISTS pending_redirect text,
  ADD COLUMN IF NOT EXISTS pending_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,             -- oturum yenilenemedi (izin geri alındı / süresi doldu) → Telegram + panel
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz;
