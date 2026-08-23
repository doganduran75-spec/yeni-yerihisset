-- ─── Email Kuyruğu ───────────────────────────────────────────────────────────
-- Toplu email gönderimini kuyruğa alır; process-queue API batch batch işler.

-- email_campaigns tablosuna status sütunu ekle
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sent';
-- queued | sending | sent | partial | cancelled

-- email_queue tablosu
CREATE TABLE IF NOT EXISTS email_queue (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      uuid NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  recipient_email  text NOT NULL,
  subject          text NOT NULL,
  html_body        text NOT NULL,
  from_name        text,
  from_email       text,
  status           text NOT NULL DEFAULT 'pending',
  -- pending | processing | sent | failed | cancelled
  error_message    text,
  sent_at          timestamptz,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_queue_campaign_status
  ON email_queue(campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_email_queue_pending
  ON email_queue(campaign_id, created_at)
  WHERE status = 'pending';

-- RLS
ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_email_queue" ON email_queue
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
