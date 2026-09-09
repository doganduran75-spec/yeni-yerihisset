-- #4 E-posta kuyruğunu genelleştir: kampanya dışı toplu mailler de kuyruğa
-- girebilsin + cron otomatik işlesin (retry ile). İşlemsel mailler ANINDA kalır.

ALTER TABLE public.email_queue ALTER COLUMN campaign_id DROP NOT NULL;
ALTER TABLE public.email_queue ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'campaign';
ALTER TABLE public.email_queue ADD COLUMN IF NOT EXISTS to_name text;
ALTER TABLE public.email_queue ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.email_queue ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

-- Cron'un tüm kampanyalarda bekleyeni hızlı bulması için
CREATE INDEX IF NOT EXISTS idx_email_queue_status_created
  ON public.email_queue (status, created_at) WHERE status = 'pending';
