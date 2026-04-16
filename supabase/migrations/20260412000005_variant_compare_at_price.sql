-- Varyasyonlara "üstü çizili" / piyasa satış fiyatı alanı ekle
-- Storefront'ta: ~~compare_at_price~~ price şeklinde gösterilir

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS compare_at_price numeric(10, 2) DEFAULT NULL;
