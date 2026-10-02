-- ============================================================
-- SUNUCU SAĞLIĞI: sürekli kontrol + dashboard kartı + uyarı e-postası
-- ============================================================
-- * server_health_runs: scripts/server-health.sh her 15 dakikada bir satır yazar
--   (disk, bellek, konteynerler, site süreçleri, güncellemeler, SSL, SSH girişleri…).
--   psql ile tablo sahibi olarak yazılır (RLS'e takılmaz); tarayıcıdan yalnız admin okur.
-- * cron_heartbeats: zamanlanmış işler (ör. pazaryeri senkronu) her çalışmada "buradayım"
--   der; uzun süre ses gelmezse kart/e-posta uyarır.
-- * server_health_alerts: aynı sorun için tekrar tekrar e-posta gitmesin diye son durum.

CREATE TABLE IF NOT EXISTS public.server_health_runs (
  id          bigserial PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  status      text NOT NULL CHECK (status IN ('ok', 'warn', 'fail')),
  checks      jsonb NOT NULL DEFAULT '[]'::jsonb   -- [{key,label,status,value,hint,alert}]
);
CREATE INDEX IF NOT EXISTS server_health_runs_created ON public.server_health_runs (created_at DESC);
ALTER TABLE public.server_health_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS server_health_runs_admin_read ON public.server_health_runs;
CREATE POLICY server_health_runs_admin_read ON public.server_health_runs FOR SELECT USING (public.is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.server_health_runs FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.cron_heartbeats (
  name         text PRIMARY KEY,
  last_run_at  timestamptz NOT NULL DEFAULT now(),
  ok           boolean NOT NULL DEFAULT true,
  message      text
);
ALTER TABLE public.cron_heartbeats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cron_heartbeats_admin_read ON public.cron_heartbeats;
CREATE POLICY cron_heartbeats_admin_read ON public.cron_heartbeats FOR SELECT USING (public.is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.cron_heartbeats FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.server_health_alerts (
  id            int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_keys     text[] NOT NULL DEFAULT '{}',
  last_sent_at  timestamptz
);
INSERT INTO public.server_health_alerts (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.server_health_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.server_health_alerts FROM anon, authenticated;

SELECT 'server_health hazır' AS durum;
