-- Attipas ölçü tablosu: sitede numaralar 19 / 20 / 21,5 / 22,5 … olarak tanımlı (kullanıcı, 2026-10-10)
-- → tablo satırının asıl adı numara, harf beden (S…XXXL) karşılık olarak kalır. Yalnız ilk kurulumdaki
-- (harfle başlayan) tablo güncellenir; yönetici elle değiştirdiyse dokunulmaz.
UPDATE public.size_charts s SET rows = '[
  {"label":"19","alt":"S","min_mm":96,"max_mm":108,"note":"0–8 ay"},
  {"label":"20","alt":"M","min_mm":109,"max_mm":115,"note":"8–12 ay"},
  {"label":"21,5","alt":"L","min_mm":116,"max_mm":125,"note":"12–18 ay"},
  {"label":"22,5","alt":"XL","min_mm":126,"max_mm":135,"note":"18–24 ay"},
  {"label":"24","alt":"XXL","min_mm":136,"max_mm":145,"note":"24–36 ay"},
  {"label":"25,5","alt":"XXXL","min_mm":146,"max_mm":155,"note":"36 ay +"}]'::jsonb, updated_at = now()
FROM public.brands b
WHERE b.id = s.brand_id AND lower(b.name) LIKE 'attipas%' AND s.rows->0->>'label' = 'S';

SELECT b.name, s.rows->0->>'label' AS ilk_numara FROM public.size_charts s JOIN public.brands b ON b.id = s.brand_id;
