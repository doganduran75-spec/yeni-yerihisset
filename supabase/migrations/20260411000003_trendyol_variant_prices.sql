-- Varyasyonlara Trendyol fiyat alanları ekleniyor
ALTER TABLE product_variants
  ADD COLUMN trendyol_psf   numeric(12,2) DEFAULT NULL, -- Piyasa Satış Fiyatı (üstü çizili gösterilir)
  ADD COLUMN trendyol_price numeric(12,2) DEFAULT NULL; -- Trendyol'daki gerçek satış fiyatı
