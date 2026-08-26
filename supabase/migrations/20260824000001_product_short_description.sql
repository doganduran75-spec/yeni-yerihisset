-- Ürünlere kısa açıklama alanı.
-- Ürün sayfasında başlığın altında (varyasyon/sepetten önce) gösterilir.
-- Mevcut `description` alanı artık "detaylı açıklama" olarak sayfanın altında kullanılır.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS short_description text;
