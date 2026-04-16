-- Google Merchant Center entegrasyon ayarları
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS gmc_merchant_id text,
  ADD COLUMN IF NOT EXISTS gmc_target_country text DEFAULT 'TR',
  ADD COLUMN IF NOT EXISTS gmc_content_language text DEFAULT 'tr',
  ADD COLUMN IF NOT EXISTS gmc_feed_secret text,
  ADD COLUMN IF NOT EXISTS gmc_product_condition text DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS gmc_default_category text,
  ADD COLUMN IF NOT EXISTS gmc_brand_default text;
