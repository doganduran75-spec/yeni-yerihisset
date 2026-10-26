-- "Evet, bendim" (kullanıcı 2026-10-26): yeni IP'den SSH girişi uyarısı panelde onaylanınca kapanır.
-- Kim / ne zaman onayladı saklanır. Yalnız sunucu (yönetici ucu) okur / yazar.
CREATE TABLE IF NOT EXISTS public.server_health_acks (
  key       text PRIMARY KEY,               -- ssh_new_ip:<IP>:<giriş unix saati>
  acked_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acked_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.server_health_acks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.server_health_acks FROM anon, authenticated;
