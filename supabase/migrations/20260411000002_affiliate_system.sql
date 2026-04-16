-- Affiliate system

-- affiliate_profiles: başvuru ve durum bilgisi
CREATE TABLE affiliate_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active', -- active, suspended
  commission_rate numeric(5,2) NOT NULL DEFAULT 10.00,
  application_answers jsonb,
  total_clicks integer NOT NULL DEFAULT 0,
  total_orders integer NOT NULL DEFAULT 0,
  total_earnings numeric(12,2) NOT NULL DEFAULT 0,
  total_paid numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- affiliate_clicks: tıklama takibi
CREATE TABLE affiliate_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES affiliate_profiles(id) ON DELETE CASCADE,
  ip_hash text,
  path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- affiliate_conversions: sipariş komisyonları
CREATE TABLE affiliate_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES affiliate_profiles(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_amount numeric(12,2) NOT NULL,
  commission_rate numeric(5,2) NOT NULL,
  commission_amount numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending, approved, paid, cancelled
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Siparişlere affiliate_id kolonu ekle
ALTER TABLE orders ADD COLUMN affiliate_id uuid REFERENCES affiliate_profiles(id) ON DELETE SET NULL;

-- İndeksler
CREATE INDEX idx_affiliate_profiles_user_id ON affiliate_profiles(user_id);
CREATE INDEX idx_affiliate_profiles_code ON affiliate_profiles(code);
CREATE INDEX idx_affiliate_clicks_affiliate_id ON affiliate_clicks(affiliate_id);
CREATE INDEX idx_affiliate_conversions_affiliate_id ON affiliate_conversions(affiliate_id);
CREATE INDEX idx_orders_affiliate_id ON orders(affiliate_id);

-- updated_at tetikleyicileri
CREATE TRIGGER set_affiliate_profiles_updated_at
  BEFORE UPDATE ON affiliate_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_affiliate_conversions_updated_at
  BEFORE UPDATE ON affiliate_conversions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS politikaları
ALTER TABLE affiliate_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Kullanıcılar kendi affiliate profilini görebilir"
  ON affiliate_profiles FOR SELECT USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "Kullanıcılar kendi affiliate profilini oluşturabilir"
  ON affiliate_profiles FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Adminler affiliate profillerini yönetebilir"
  ON affiliate_profiles FOR UPDATE USING (is_admin());

CREATE POLICY "Adminler affiliate tıklamalarını yönetebilir"
  ON affiliate_clicks FOR ALL USING (is_admin());

CREATE POLICY "Kullanıcılar kendi tıklamalarını görebilir"
  ON affiliate_clicks FOR SELECT USING (
    affiliate_id IN (SELECT id FROM affiliate_profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Adminler affiliate dönüşümlerini yönetebilir"
  ON affiliate_conversions FOR ALL USING (is_admin());

CREATE POLICY "Kullanıcılar kendi dönüşümlerini görebilir"
  ON affiliate_conversions FOR SELECT USING (
    affiliate_id IN (SELECT id FROM affiliate_profiles WHERE user_id = auth.uid())
  );
