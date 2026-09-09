-- "Aradığını bulamadın mı?" — basit geri bildirim/talep kutusu.
-- Ziyaretçi e-posta + not bırakır; admin görür. E-postadan hızlı.

CREATE TABLE IF NOT EXISTS public.feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text,
  message     text NOT NULL,
  source      text DEFAULT 'products',   -- hangi sayfadan geldi
  is_handled  boolean NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_created ON public.feedback (created_at DESC);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Yalnız admin okur/yönetir. Ekleme API (service_role) ile yapılır → public RLS gerekmez.
DROP POLICY IF EXISTS "admin manage feedback" ON public.feedback;
CREATE POLICY "admin manage feedback"
  ON public.feedback FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
