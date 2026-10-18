-- ============================================================
-- MAĞAZA İKİYE: Yetişkin / 0–4 Yaş İlkadım (kullanıcı kararları 2026-10-18)
-- ============================================================
-- Her kategori bir segmente bağlı (Ayarlar › Kategoriler'den değişir). /magaza seçim ekranı,
-- /magaza/yetiskin ve /magaza/ilkadim segment mağazaları; Aksesuar yetişkin altında bir kategori.
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS segment text NOT NULL DEFAULT 'yetiskin';
DO $$ BEGIN
  ALTER TABLE public.categories ADD CONSTRAINT categories_segment_chk CHECK (segment IN ('yetiskin', 'ilkadim'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- İlk dağıtım: adı / adresi "ilk adım" geçen kategoriler ya da ürünlerinin tamamı Attipas olanlar → ilkadım
UPDATE public.categories c SET segment = 'ilkadim'
 WHERE c.segment = 'yetiskin' AND (
   lower(c.name) LIKE '%ilk%' OR c.slug LIKE '%ilk%'
   OR (EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id)
       AND NOT EXISTS (SELECT 1 FROM public.products p LEFT JOIN public.brands b ON b.id = p.brand_id
                        WHERE p.category_id = c.id AND coalesce(lower(b.name), '') <> 'attipas'))
 );
