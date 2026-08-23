-- ─── Sipariş Yorumları ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_reviews (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating_shipping       smallint NOT NULL CHECK (rating_shipping BETWEEN 1 AND 5),
  rating_quality        smallint NOT NULL CHECK (rating_quality BETWEEN 1 AND 5),
  rating_communication  smallint NOT NULL CHECK (rating_communication BETWEEN 1 AND 5),
  comment               text,
  images                text[] DEFAULT '{}',
  is_approved           boolean NOT NULL DEFAULT false,
  admin_note            text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  UNIQUE (order_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_order_reviews_user    ON order_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_order_reviews_order   ON order_reviews(order_id);
CREATE INDEX IF NOT EXISTS idx_order_reviews_pending ON order_reviews(created_at) WHERE is_approved = false;

-- RLS
ALTER TABLE order_reviews ENABLE ROW LEVEL SECURITY;

-- Kullanıcı kendi yorumunu görebilir ve ekleyebilir
CREATE POLICY "user_own_reviews" ON order_reviews
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin tam erişim
CREATE POLICY "admin_all_reviews" ON order_reviews
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Onaylı yorumlar herkese açık (ürün sayfası için)
CREATE POLICY "public_approved_reviews" ON order_reviews
  FOR SELECT TO anon, authenticated
  USING (is_approved = true);
