-- Yedekleme / geri-yükleme-testi sonuçları → admin dashboard'da "Yedekleme" kutusu.
-- Sunucudaki betikler (scripts/db-backup.sh, scripts/db-backup-test.sh) her
-- çalıştığında buraya bir satır yazar (psql, tablo sahibi olarak → RLS'e takılmaz).
-- Tarayıcıdan yalnız admin OKUR; kimse yazamaz.
CREATE TABLE IF NOT EXISTS public.backup_runs (
  id            bigserial PRIMARY KEY,
  kind          text NOT NULL CHECK (kind IN ('backup', 'restore_test')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  ok            boolean NOT NULL,
  local_ok      boolean,
  offsite_ok    boolean,
  backup_name   text,
  db_bytes      bigint,
  storage_bytes bigint,
  tables_checked int,
  message       text
);
CREATE INDEX IF NOT EXISTS backup_runs_kind_created ON public.backup_runs (kind, created_at DESC);

ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS backup_runs_admin_read ON public.backup_runs;
CREATE POLICY backup_runs_admin_read ON public.backup_runs FOR SELECT USING (public.is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.backup_runs FROM anon, authenticated;

-- 1 yıldan eski kayıtları tutma (her gece 1 satır → küçük tablo)
DELETE FROM public.backup_runs WHERE created_at < now() - interval '365 days';

SELECT 'backup_runs hazır' AS durum, count(*) AS kayit FROM public.backup_runs;
