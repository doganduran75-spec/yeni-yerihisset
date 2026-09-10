-- ─────────────────────────────────────────────────────────────────────────────
-- First-party analitik (Yol B) — ziyaretçi yolculuğu + kaynak/kampanya + IP
--
-- İki tablo: analytics_sessions (ziyaret = 1 satır, kimlik/kaynak/IP burada),
-- analytics_events (yolculuk = N satır). analytics_daily = kalıcı günlük özet.
-- Yazma yalnızca /api/track içinden service_role ile yapılır (RLS atlanır);
-- okuma yalnızca admin. Ham veri retention: event 180 gün, session 365 gün.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Oturumlar ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.analytics_sessions (
  session_id    uuid PRIMARY KEY,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_id    uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,
  referrer      text,
  landing_path  text,
  ip            text,
  user_agent    text,
  device        text,          -- mobile | tablet | desktop
  is_bot        boolean NOT NULL DEFAULT false,
  event_count   integer NOT NULL DEFAULT 0,
  started_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asessions_started   ON public.analytics_sessions (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_asessions_user      ON public.analytics_sessions (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_asessions_campaign  ON public.analytics_sessions (utm_source, utm_campaign);
CREATE INDEX IF NOT EXISTS idx_asessions_human     ON public.analytics_sessions (started_at DESC) WHERE is_bot = false;

-- ── Event'ler ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id  uuid NOT NULL REFERENCES public.analytics_sessions(session_id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type  text NOT NULL,
  path        text,
  meta        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aevents_session ON public.analytics_events (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_aevents_type    ON public.analytics_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aevents_created ON public.analytics_events (created_at DESC);

-- ── Kalıcı günlük özet (rollup) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.analytics_daily (
  day            date NOT NULL,
  utm_source     text NOT NULL DEFAULT '(direct)',
  utm_campaign   text NOT NULL DEFAULT '(none)',
  sessions       integer NOT NULL DEFAULT 0,
  users          integer NOT NULL DEFAULT 0,
  pageviews      integer NOT NULL DEFAULT 0,
  add_to_carts   integer NOT NULL DEFAULT 0,
  coupon_applies integer NOT NULL DEFAULT 0,
  purchases      integer NOT NULL DEFAULT 0,
  revenue        numeric(12,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (day, utm_source, utm_campaign)
);

-- ── coupons ↔ kampanya bağı (Instagram ölçümü için) ──────────────────────────
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS campaign_slug text;
CREATE INDEX IF NOT EXISTS idx_coupons_campaign ON public.coupons (campaign_slug) WHERE campaign_slug IS NOT NULL;

-- ── RLS: okuma yalnız admin; yazma service_role (RLS atlar) ──────────────────
ALTER TABLE public.analytics_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_daily    ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins read sessions" ON public.analytics_sessions FOR SELECT USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins read events" ON public.analytics_events FOR SELECT USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins read daily" ON public.analytics_daily FOR SELECT USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Retention temizliği (cron) ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prune_analytics()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE deleted_events bigint; deleted_sessions bigint;
BEGIN
  DELETE FROM public.analytics_events   WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS deleted_events = ROW_COUNT;
  DELETE FROM public.analytics_sessions WHERE started_at < now() - interval '365 days';
  GET DIAGNOSTICS deleted_sessions = ROW_COUNT;
  RETURN jsonb_build_object('deleted_events', deleted_events, 'deleted_sessions', deleted_sessions);
END $$;

-- ── Günlük özet üretimi (cron, dün için) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rollup_analytics_daily(target_day date DEFAULT (current_date - 1))
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.analytics_daily WHERE day = target_day;
  INSERT INTO public.analytics_daily (day, utm_source, utm_campaign, sessions, users, pageviews, add_to_carts, coupon_applies, purchases, revenue)
  SELECT
    target_day,
    COALESCE(NULLIF(s.utm_source, ''), '(direct)'),
    COALESCE(NULLIF(s.utm_campaign, ''), '(none)'),
    COUNT(DISTINCT s.session_id),
    COUNT(DISTINCT s.user_id),
    COUNT(*) FILTER (WHERE e.event_type = 'page_view'),
    COUNT(*) FILTER (WHERE e.event_type IN ('add_to_cart','quick_buy')),
    COUNT(*) FILTER (WHERE e.event_type = 'coupon_apply'),
    COUNT(*) FILTER (WHERE e.event_type = 'purchase'),
    COALESCE(SUM((e.meta->>'value')::numeric) FILTER (WHERE e.event_type = 'purchase'), 0)
  FROM public.analytics_sessions s
  LEFT JOIN public.analytics_events e ON e.session_id = s.session_id
  WHERE s.is_bot = false
    AND s.started_at >= target_day AND s.started_at < target_day + 1
  GROUP BY 1, 2, 3;
END $$;

-- ── Analitik depolama boyutu (admin dashboard "DB'de kapladığı yer") ─────────
CREATE OR REPLACE FUNCTION public.analytics_storage()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'yetkisiz'; END IF;
  SELECT jsonb_build_object(
    'sessions_bytes', pg_total_relation_size('public.analytics_sessions'),
    'events_bytes',   pg_total_relation_size('public.analytics_events'),
    'daily_bytes',    pg_total_relation_size('public.analytics_daily'),
    'total_bytes',    pg_total_relation_size('public.analytics_sessions')
                    + pg_total_relation_size('public.analytics_events')
                    + pg_total_relation_size('public.analytics_daily'),
    'sessions_rows',  (SELECT reltuples::bigint FROM pg_class WHERE oid = 'public.analytics_sessions'::regclass),
    'events_rows',    (SELECT reltuples::bigint FROM pg_class WHERE oid = 'public.analytics_events'::regclass)
  ) INTO result;
  RETURN result;
END $$;
