-- Sayfa içerik yönetimi — admin panelinden düzenlenebilir metinler, görseller
CREATE TABLE IF NOT EXISTS site_content (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page       text NOT NULL,        -- 'home', 'global', vb.
  section    text NOT NULL,        -- 'hero', 'settings', vb.
  key        text NOT NULL,        -- 'hero_title', 'hero_image', vb.
  value      text,
  type       text NOT NULL DEFAULT 'text', -- 'text' | 'textarea' | 'image'
  label      text NOT NULL DEFAULT '',
  sort_order int  NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (page, key)
);

ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;

-- Herkes okuyabilir (frontend için)
CREATE POLICY "Public read site_content"
  ON site_content FOR SELECT USING (true);

-- Giriş yapan kullanıcılar yazabilir (admin guard sayfayı korur)
CREATE POLICY "Authenticated write site_content"
  ON site_content FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Varsayılan içerikler (mevcut hardcoded değerler)
INSERT INTO site_content (page, section, key, type, label, sort_order, value) VALUES
  ('home', 'hero', 'badge',        'text',     'Üst Badge',             1,  'Yeni Sezon Yayında'),
  ('home', 'hero', 'title_line1',  'text',     'Başlık Satır 1',        2,  'Evinizin'),
  ('home', 'hero', 'title_line2',  'text',     'Başlık Satır 2 (mavi)', 3,  'Ruhunu'),
  ('home', 'hero', 'title_line3',  'text',     'Başlık Satır 3',        4,  'Keşfedin.'),
  ('home', 'hero', 'subtitle',     'textarea', 'Alt Metin',             5,  'Modern tasarımlar ve kaliteli materyallerle yaşam alanınızı yeniden hayal edin. İlk siparişe özel %10 indirim fırsatını kaçırmayın.'),
  ('home', 'hero', 'cta_primary',  'text',     'Ana Buton',             6,  'ALIŞVERİŞE BAŞLA'),
  ('home', 'hero', 'cta_secondary','text',     'İkincil Link',          7,  'Koleksiyonları Gör'),
  ('home', 'hero', 'image',        'image',    'Hero Görseli',          8,  'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?q=80&w=1200'),
  ('home', 'hero', 'card_title',   'text',     'Kart Başlığı',          9,  'Modern Berjer'),
  ('home', 'hero', 'card_badge',   'text',     'Kart Rozeti',           10, 'Sınırlı Stok'),
  ('home', 'stats', 'stat1_value', 'text',     '1. İstatistik Değer',   1,  '10k+'),
  ('home', 'stats', 'stat1_label', 'text',     '1. İstatistik Etiket',  2,  'Mutlu Müşteri'),
  ('home', 'stats', 'stat2_value', 'text',     '2. İstatistik Değer',   3,  '500+'),
  ('home', 'stats', 'stat2_label', 'text',     '2. İstatistik Etiket',  4,  'Özel Tasarım'),
  ('global', 'brand', 'site_name', 'text',     'Site Adı',              1,  'YeriHisset'),
  ('global', 'brand', 'tagline',   'text',     'Slogan',                2,  'Evinizin Ruhunu Hissedin')
ON CONFLICT (page, key) DO NOTHING;
