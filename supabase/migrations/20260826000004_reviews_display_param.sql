-- Ürün sayfasındaki yorum gösterimi için parametre + ileride ürün-bazlı filtre.
-- product_reviews_show_all=true iken her ürün sayfasında TÜM onaylı yorumlar
-- gösterilir (yorum sayısı azken pratik). false iken order_reviews.product_id
-- ile o ürüne ait yorumlar gösterilir (yorumlar çoğalınca).
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS product_reviews_show_all boolean NOT NULL DEFAULT true;

ALTER TABLE public.order_reviews
  ADD COLUMN IF NOT EXISTS product_id uuid;
