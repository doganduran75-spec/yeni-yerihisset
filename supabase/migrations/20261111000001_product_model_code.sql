-- Ürün adından stok/model kodu ayrıldı (2026-10-12, SEO): "Dodura … (Beyaz-Beyaz) DDRBB01" → ad kodsuz,
-- kod ayrı alanda (ürün sayfasında "Ürün kodu", yapısal veride mpn). Adres (slug) DEĞİŞMEZ.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS model_code text;

UPDATE public.products
SET model_code = coalesce(model_code, substring(title from '\s([A-Z]{2,}[A-Z0-9]*[0-9]{2})\s*$')),
    title      = btrim(regexp_replace(title, '\s+[A-Z]{2,}[A-Z0-9]*[0-9]{2}\s*$', ''))
WHERE title ~ '\s[A-Z]{2,}[A-Z0-9]*[0-9]{2}\s*$';
