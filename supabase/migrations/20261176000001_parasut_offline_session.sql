-- Paraşüt bağlantısı "Session not active" ile kopuyordu (2026-11-10, Telegram: entegrasyon hatası). id.parasut.com (Keycloak)
-- normal oturumda refresh_token kullanıcının Paraşüt GİRİŞ oturumuna bağlı: giriş oturumu kapanınca (Paraşüt'ten çıkış,
-- boşta kalma / en uzun süre dolması) yenileme reddedilir. Bağlanırken "offline_access" istenir → süresiz (çevrimdışı)
-- oturum: girişten bağımsız, kullanıldıkça yaşar. Paraşüt izin vermezse bir sonraki bağlanma normal oturumla yapılır.
ALTER TABLE public.parasut_auth
  ADD COLUMN IF NOT EXISTS offline         boolean NOT NULL DEFAULT false, -- bu bağlantı süresiz (offline_access) oturum mu
  ADD COLUMN IF NOT EXISTS offline_denied  boolean NOT NULL DEFAULT false, -- Paraşüt offline_access vermedi → normal oturum iste
  ADD COLUMN IF NOT EXISTS last_drop_error text,                          -- son kopmanın nedeni (yeniden bağlanınca silinmesin)
  ADD COLUMN IF NOT EXISTS last_drop_at    timestamptz;
