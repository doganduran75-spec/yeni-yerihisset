-- Stok bildirim talepleri tablosu
-- Kayıtlı kullanıcı: user_id dolu, email/phone null olabilir
-- Misafir: user_id null, email veya phone dolu

CREATE TABLE IF NOT EXISTS stock_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id  uuid REFERENCES product_variants(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email       text,
  phone       text,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'notified')),
  created_at  timestamptz DEFAULT now(),
  notified_at timestamptz,
  CONSTRAINT stock_notifications_contact_check
    CHECK (user_id IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS stock_notifications_variant_status
  ON stock_notifications (variant_id, status);

CREATE INDEX IF NOT EXISTS stock_notifications_product_status
  ON stock_notifications (product_id, status);

ALTER TABLE stock_notifications ENABLE ROW LEVEL SECURITY;

-- API route (service role) tüm işlemleri yapabilir — RLS'yi atlar
-- Authenticated kullanıcılar okuyabilir (admin sayfası için)
CREATE POLICY "Authenticated users can read stock_notifications"
  ON stock_notifications FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated kullanıcılar notified olarak işaretleyebilir
CREATE POLICY "Authenticated users can update stock_notifications"
  ON stock_notifications FOR UPDATE
  TO authenticated
  USING (true);
