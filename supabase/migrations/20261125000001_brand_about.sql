-- Marka hakkında (kullanıcı, 2026-10-15): markaya ait görselli / biçimli içerik bir kez yazılır, o markanın TÜM
-- ürün sayfalarında "Marka hakkında" bölümü olarak görünür (Ayarlar › Markalar › Sayfa metni). Ürün açıklaması da
-- artık görselli / biçimli (products.description HTML olabilir; eski düz metinler aynen gösterilir).
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS about text;
