-- Varyasyona özel ürün görseli
ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS image_url text;
