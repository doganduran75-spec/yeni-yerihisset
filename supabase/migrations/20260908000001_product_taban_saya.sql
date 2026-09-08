-- Ürün seviyesinde Taban ve Saya nitelikleri.
-- Barefoot ayakkabıda taban (sole) ve saya (upper) modelin yapısal özelliğidir;
-- tüm numaralarda aynıdır → ürün seviyesinde tek-seçim. Her biri bir
-- variant_options kaydına işaret eder ("Taban" / "Saya" adlı gruplardan).
-- Seçenek silinirse ürün kaydı bozulmasın diye ON DELETE SET NULL.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS taban_option_id uuid
    REFERENCES variant_options(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS saya_option_id uuid
    REFERENCES variant_options(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_taban_option ON products(taban_option_id);
CREATE INDEX IF NOT EXISTS idx_products_saya_option  ON products(saya_option_id);
