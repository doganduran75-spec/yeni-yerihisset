-- Giriş sonrası açılan popup sistemi

-- Popup yapılandırması (tek satır, upsert ile yönetilir)
CREATE TABLE IF NOT EXISTS popup_config (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active      boolean NOT NULL DEFAULT false,
  title          text NOT NULL DEFAULT 'Hoş Geldiniz! 👋',
  content        text NOT NULL DEFAULT '',
  button_text    text NOT NULL DEFAULT '',
  button_url     text NOT NULL DEFAULT '',
  delay_seconds  integer NOT NULL DEFAULT 3,
  cooldown_days  integer NOT NULL DEFAULT 7,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

-- Varsayılan satırı ekle (tek satır sistemi)
INSERT INTO popup_config (is_active) VALUES (false)
ON CONFLICT DO NOTHING;

-- Her kullanıcının popup'ı en son ne zaman gördüğü
CREATE TABLE IF NOT EXISTS popup_impressions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shown_at   timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- RLS
ALTER TABLE popup_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE popup_impressions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Public read popup_config"
    ON popup_config FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins manage popup_config"
    ON popup_config FOR ALL
    USING (is_admin()) WITH CHECK (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users manage own impressions"
    ON popup_impressions FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins read all impressions"
    ON popup_impressions FOR SELECT
    USING (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
