-- Kategori / marka sayfalarına tanıtım metni + SSS (2026-10-12, SEO/GEO): sayfa yalnız ürün listesiydi → yapay zekâ
-- ve arama motoru için "bu sayfa ne?" sorusunun cevabı yoktu. Ayarlar › Kategoriler / Markalar › "Sayfa metni".
-- faq: [{ "q": "soru", "a": "cevap" }, …] — sayfada soru-cevap + FAQPage yapısal verisi.
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS intro text;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS faq jsonb;
ALTER TABLE public.brands     ADD COLUMN IF NOT EXISTS intro text;
ALTER TABLE public.brands     ADD COLUMN IF NOT EXISTS faq jsonb;
