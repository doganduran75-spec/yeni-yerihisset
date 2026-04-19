-- ─── Bedelsiz Ürün Hediye Kuralları ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS free_gift_rules (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,                          -- Admin etiketi
  trigger_category_id  uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  gift_product_id      uuid NOT NULL REFERENCES products(id)   ON DELETE CASCADE,
  quantity_mode        text NOT NULL DEFAULT 'per_order'
                       CHECK (quantity_mode IN ('per_item', 'per_order', 'first_order')),
  is_active            boolean DEFAULT true,
  valid_until          date,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gift_rules_category ON free_gift_rules(trigger_category_id);
CREATE INDEX IF NOT EXISTS idx_gift_rules_product  ON free_gift_rules(gift_product_id);

CREATE TRIGGER update_free_gift_rules_updated_at
  BEFORE UPDATE ON free_gift_rules
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- RLS
ALTER TABLE free_gift_rules ENABLE ROW LEVEL SECURITY;

-- Herkes aktif ve geçerli kuralları görebilir (sepete ürün eklerken kontrol)
CREATE POLICY "public_read_gift_rules" ON free_gift_rules
  FOR SELECT TO anon, authenticated
  USING (
    is_active = true
    AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
  );

-- Admin tam erişim
CREATE POLICY "admin_all_gift_rules" ON free_gift_rules
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

GRANT SELECT ON free_gift_rules TO anon;
