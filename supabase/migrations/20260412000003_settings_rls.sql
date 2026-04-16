-- Settings tablosu RLS politikaları
-- Tablo zaten varsa yok say, yoksa oluştur

CREATE TABLE IF NOT EXISTS settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name      text,
  store_logo_url  text,
  contact_email   text,
  contact_phone   text,
  address         text,
  currency        text DEFAULT 'TRY',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Varsayılan ayar satırı (single-row pattern)
INSERT INTO settings (store_name, currency)
VALUES ('YeriHisset', 'TRY')
ON CONFLICT DO NOTHING;

-- RLS etkinleştir
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Herkes okuyabilir (logo, para birimi vb. public bilgiler)
DO $$ BEGIN
  CREATE POLICY "Public read settings"
    ON settings FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Sadece adminler yazabilir
DO $$ BEGIN
  CREATE POLICY "Admins manage settings"
    ON settings FOR ALL
    USING (is_admin()) WITH CHECK (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
