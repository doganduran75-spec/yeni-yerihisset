-- Paraşüt oturum yenileme kilidi (2026-11-08): site pm2 cluster'da 4 işlemle çalışıyor; iki işlem aynı refresh_token'la
-- aynı anda yenilerse id.parasut.com oturumu kapatıyor ("Paraşüt bağlantısı sona erdi"). Kilidi alan yeniler, diğerleri bekler
-- (src/lib/parasut.ts accessToken).
ALTER TABLE public.parasut_auth
  ADD COLUMN IF NOT EXISTS refresh_lock_until timestamptz;
