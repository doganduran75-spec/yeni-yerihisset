-- ÖLÇÜ TABLOLARI (kullanıcı notu 7, 2026-10-10) — marka başına bir tablo (Ayarlar › Markalar › Ölçü tablosu).
-- Kural (kullanıcı): PAY EKLENMEZ — ayak ölçüsü hangi numaranın aralığındaysa o numara önerilir.
--   Yetişkin: aralığın üst sınırına yakınsa "genelde alıştığın numara uyar" notu.
--   Çocuk/bebek (grow_up_mm > 0): ölçü aralığın üst sınırına grow_up_mm kadar yakınsa bir üst numara
--   önerilir ("hızlı büyüyor") — örn. Attipas 104–112 mm aralığında 110–111 → üst numara.
-- rows: [{ label: varyant değeri (ör. "40" / "M"), alt: diğer karşılık (ör. "20"), min_mm, max_mm, note }]
-- Öneri hesabı: src/lib/size-chart.ts (ürün sayfası "Numaramı bul").

CREATE TABLE IF NOT EXISTS public.size_charts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    uuid NOT NULL UNIQUE REFERENCES public.brands(id) ON DELETE CASCADE,
  title       text,
  note        text,
  kids        boolean NOT NULL DEFAULT false,
  grow_up_mm  int NOT NULL DEFAULT 0,
  rows        jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.size_charts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS size_charts_read ON public.size_charts;
CREATE POLICY size_charts_read ON public.size_charts FOR SELECT USING (true);
DROP POLICY IF EXISTS size_charts_admin_write ON public.size_charts;
CREATE POLICY size_charts_admin_write ON public.size_charts FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT ON public.size_charts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.size_charts TO authenticated;

-- Dodura (kullanıcının ölçü rehberi: 36→22 cm … 46→30 cm; her numara bir öncekinin üstünden bu ölçüye kadar)
INSERT INTO public.size_charts (brand_id, title, note, kids, grow_up_mm, rows)
SELECT b.id, 'Dodura ölçü rehberi', 'Genelde alıştığın numara uyar. Ölçün iki numara arasındaysa ayağın genişse büyüğü seç.', false, 0, '[
  {"label":"36","min_mm":211,"max_mm":220},{"label":"37","min_mm":221,"max_mm":230},
  {"label":"38","min_mm":231,"max_mm":240},{"label":"39","min_mm":241,"max_mm":250},
  {"label":"40","min_mm":251,"max_mm":255},{"label":"41","min_mm":256,"max_mm":265},
  {"label":"42","min_mm":266,"max_mm":270},{"label":"43","min_mm":271,"max_mm":275},
  {"label":"44","min_mm":276,"max_mm":280},{"label":"45","min_mm":281,"max_mm":290},
  {"label":"46","min_mm":291,"max_mm":300}]'::jsonb
FROM public.brands b WHERE lower(b.name) LIKE 'dodura%'
ON CONFLICT (brand_id) DO NOTHING;

-- Attipas (bebek: S…XXXL, No ve tahmini ay; aralığın üst 2 mm'sinde bir üst beden önerilir)
INSERT INTO public.size_charts (brand_id, title, note, kids, grow_up_mm, rows)
SELECT b.id, 'Attipas ölçü tablosu', 'Bebek ayağı hızlı büyür: ölçü aralığın üst sınırına yakınsa bir üst bedeni öneriyoruz.', true, 2, '[
  {"label":"S","alt":"19","min_mm":96,"max_mm":108,"note":"0–8 ay"},
  {"label":"M","alt":"20","min_mm":109,"max_mm":115,"note":"8–12 ay"},
  {"label":"L","alt":"21.5","min_mm":116,"max_mm":125,"note":"12–18 ay"},
  {"label":"XL","alt":"22.5","min_mm":126,"max_mm":135,"note":"18–24 ay"},
  {"label":"XXL","alt":"24","min_mm":136,"max_mm":145,"note":"24–36 ay"},
  {"label":"XXXL","alt":"25.5","min_mm":146,"max_mm":155,"note":"36 ay +"}]'::jsonb
FROM public.brands b WHERE lower(b.name) LIKE 'attipas%'
ON CONFLICT (brand_id) DO NOTHING;

SELECT b.name AS marka, s.title, jsonb_array_length(s.rows) AS satir FROM public.size_charts s JOIN public.brands b ON b.id = s.brand_id;
