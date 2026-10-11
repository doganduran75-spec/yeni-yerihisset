-- ÇEREZ ONAYI (2026-10-11): kategorili onay (zorunlu / istatistik / pazarlama) + yönetici anahtarı.
--   settings.cookie_consent_strict
--     false (DENEME MODU, varsayılan): ziyaretçi seçim yapana kadar tam ziyaret kaydı (IP dahil) tutulur;
--            "Kabul" → devam; "Reddet" → o ziyaretin kaydı anonimleşir (IP / tarayıcı / üye bağı silinir),
--            sonrası yalnız IP'siz sayım.
--     true  (KVKK MODU): istatistik izni verilene kadar yalnız IP'siz sayım.
--   Her ziyaret satırında seçim görünür (analytics_sessions.consent) + onay defteri (consent_log, ispat için).
--   Reddedenler / izinsizler için kimliksiz günlük sayaç: analytics_anon_daily (gün · sayfa · kaynak · cihaz).

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS cookie_consent_strict boolean NOT NULL DEFAULT false;
-- Not: anon / authenticated'a SELECT verilmez (yalnız sunucu okur: /api/track, yönetim paneli API'si).

ALTER TABLE public.analytics_sessions ADD COLUMN IF NOT EXISTS consent text;          -- accepted · rejected · custom · NULL (seçim yok)
ALTER TABLE public.analytics_sessions ADD COLUMN IF NOT EXISTS consent_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_asessions_consent ON public.analytics_sessions (consent, started_at DESC);

CREATE TABLE IF NOT EXISTS public.consent_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  session_id  uuid,                      -- tam kayıt varsa ilgili ziyaret (reddedilince de kalır, IP'siz)
  stats       boolean NOT NULL,
  marketing   boolean NOT NULL,
  mode        text NOT NULL,             -- open (deneme) · strict (KVKK)
  version     text NOT NULL DEFAULT '1'  -- pencere / politika metni sürümü
);
CREATE INDEX IF NOT EXISTS idx_consent_log_time ON public.consent_log (created_at DESC);
ALTER TABLE public.consent_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consent_log FROM anon;
DROP POLICY IF EXISTS consent_log_admin_read ON public.consent_log;
CREATE POLICY consent_log_admin_read ON public.consent_log FOR SELECT TO authenticated USING (public.is_admin());

CREATE TABLE IF NOT EXISTS public.analytics_anon_daily (
  day     date NOT NULL,
  path    text NOT NULL,
  source  text NOT NULL,                 -- utm kaynağı / yönlendiren site / (doğrudan) / (site içi)
  device  text NOT NULL,
  views   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path, source, device)
);
ALTER TABLE public.analytics_anon_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_anon_daily FROM anon;
DROP POLICY IF EXISTS analytics_anon_daily_admin_read ON public.analytics_anon_daily;
CREATE POLICY analytics_anon_daily_admin_read ON public.analytics_anon_daily FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.analytics_anon_hit(p_path text, p_source text, p_device text, p_n int DEFAULT 1)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.analytics_anon_daily (day, path, source, device, views)
  VALUES ((now() AT TIME ZONE 'Europe/Istanbul')::date, left(coalesce(p_path, '/'), 200), left(coalesce(p_source, '(doğrudan)'), 80),
          coalesce(p_device, 'desktop'), GREATEST(1, LEAST(coalesce(p_n, 1), 50)))
  ON CONFLICT (day, path, source, device) DO UPDATE SET views = public.analytics_anon_daily.views + EXCLUDED.views;
$$;
REVOKE ALL ON FUNCTION public.analytics_anon_hit(text, text, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_anon_hit(text, text, text, int) TO service_role;
