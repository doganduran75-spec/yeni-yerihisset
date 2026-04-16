-- Ürün ve varyasyon bazlı üye etiket atamaları
-- Ürün satın alındığında otomatik olarak üyeye etiket atanır

-- Ürün düzeyinde etiket atamaları (ürünün her varyasyonu için geçerli)
CREATE TABLE IF NOT EXISTS product_tag_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tag_option_id  uuid NOT NULL REFERENCES member_tag_options(id) ON DELETE CASCADE,
  UNIQUE(product_id, tag_option_id)
);

-- Varyasyon düzeyinde etiket atamaları (sadece o varyasyon satın alındığında)
CREATE TABLE IF NOT EXISTS variant_tag_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id     uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  tag_option_id  uuid NOT NULL REFERENCES member_tag_options(id) ON DELETE CASCADE,
  UNIQUE(variant_id, tag_option_id)
);

-- RLS
ALTER TABLE product_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE variant_tag_assignments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins manage product_tag_assignments"
    ON product_tag_assignments FOR ALL
    USING (is_admin()) WITH CHECK (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public read product_tag_assignments"
    ON product_tag_assignments FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins manage variant_tag_assignments"
    ON variant_tag_assignments FOR ALL
    USING (is_admin()) WITH CHECK (is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public read variant_tag_assignments"
    ON variant_tag_assignments FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
