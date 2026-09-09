-- "Üretimde" adedi — üreticiye verilen (yolda/üretimdeki) sipariş miktarı.
-- Stok gibi ürün/varyant seviyesinde; admin elle girer, stoktan bağımsız izlenir.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS in_production integer NOT NULL DEFAULT 0;

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS in_production integer NOT NULL DEFAULT 0;
