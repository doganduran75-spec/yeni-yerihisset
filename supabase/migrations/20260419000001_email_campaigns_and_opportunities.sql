-- ─── Email Kampanya Takibi ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_campaigns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_slug    text NOT NULL,          -- utm_campaign değeri
  subject          text NOT NULL,
  html_body        text,
  recipient_type   text NOT NULL DEFAULT 'all', -- all | tag | manual
  recipient_count  integer DEFAULT 0,
  sent_at          timestamptz DEFAULT now(),
  created_at       timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_campaign_sends (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      uuid REFERENCES email_campaigns(id) ON DELETE CASCADE,
  recipient_email  text NOT NULL,
  status           text NOT NULL DEFAULT 'sent', -- sent | failed
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_sends_campaign ON email_campaign_sends(campaign_id);

-- RLS
ALTER TABLE email_campaigns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaign_sends ENABLE ROW LEVEL SECURITY;

-- Admin okuma/yazma
CREATE POLICY "admin_all_campaigns" ON email_campaigns
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "admin_all_sends" ON email_campaign_sends
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─── İş Ortağı Fırsatları ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS partner_opportunities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_name     text NOT NULL,
  title            text NOT NULL,
  description      text,
  image_url        text,
  url              text NOT NULL,           -- yönlendirme URL'i
  discount_code    text,                   -- varsa kupon kodu
  valid_until      date,
  is_active        boolean DEFAULT true,
  click_count      integer DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS opportunity_clicks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id   uuid REFERENCES partner_opportunities(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_hash          text,                   -- anonim IP özeti (KVKK uyumu)
  referrer         text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opp_clicks_opp ON opportunity_clicks(opportunity_id);

-- RLS
ALTER TABLE partner_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_clicks    ENABLE ROW LEVEL SECURITY;

-- Herkes aktif fırsatları görebilir
CREATE POLICY "public_read_opportunities" ON partner_opportunities
  FOR SELECT TO anon, authenticated USING (is_active = true);

-- Admin tam erişim
CREATE POLICY "admin_all_opportunities" ON partner_opportunities
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Tıklama kaydı herkes ekleyebilir (anonim dahil)
CREATE POLICY "anyone_insert_clicks" ON opportunity_clicks
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Admin tıklamaları okuyabilir
CREATE POLICY "admin_read_clicks" ON opportunity_clicks
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

GRANT SELECT ON partner_opportunities TO anon;
GRANT INSERT ON opportunity_clicks TO anon;
