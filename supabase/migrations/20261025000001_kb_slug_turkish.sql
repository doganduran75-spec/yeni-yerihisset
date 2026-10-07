-- ============================================================
-- BİLGİ BANKASI ADRESLERİ: Türkçe harfler silinmişti → karşılığına çevir
-- ============================================================
-- Eski üretici ğ, ş, ı, ç… harflerini SİLİYORDU: "Doğru İş İçin Doğru Araç" →
-- /bilgi-bankasi/doru-i-iin-doru-ara. Yeni üretici (src/lib/slug.ts) çeviriyor:
-- dogru-is-icin-dogru-arac. Burada mevcut makale ve kategori adresleri başlıktan
-- yeniden üretilir (aynı adres iki kayıtta çıkarsa sonuna -2, -3…). Site henüz canlı
-- olmadığı için eski adreslere yönlendirme gerekmiyor. Tekrar çalıştırmak güvenli.

DO $$
DECLARE
  r record; base text; cand text; n int;
BEGIN
  -- Makaleler (eskiden oluşturulma sırasına göre: önce gelen sade adresi alır)
  FOR r IN SELECT id, title, slug FROM public.kb_articles ORDER BY created_at LOOP
    base := trim(both '-' from regexp_replace(
              lower(translate(coalesce(r.title, ''), 'ğĞüÜşŞıİIöÖçÇâÂîÎûÛ', 'gguussiiiooccaaiiuu')),
              '[^a-z0-9]+', '-', 'g'));
    IF base = '' THEN base := 'makale'; END IF;
    cand := base; n := 2;
    WHILE EXISTS (SELECT 1 FROM public.kb_articles a WHERE a.slug = cand AND a.id <> r.id) LOOP
      cand := base || '-' || n; n := n + 1;
    END LOOP;
    IF r.slug IS DISTINCT FROM cand THEN
      UPDATE public.kb_articles SET slug = cand WHERE id = r.id;
      RAISE NOTICE 'makale: % → %', r.slug, cand;
    END IF;
  END LOOP;

  -- Kategoriler
  FOR r IN SELECT id, name, slug FROM public.kb_categories ORDER BY created_at LOOP
    base := trim(both '-' from regexp_replace(
              lower(translate(coalesce(r.name, ''), 'ğĞüÜşŞıİIöÖçÇâÂîÎûÛ', 'gguussiiiooccaaiiuu')),
              '[^a-z0-9]+', '-', 'g'));
    IF base = '' THEN base := 'kategori'; END IF;
    cand := base; n := 2;
    WHILE EXISTS (SELECT 1 FROM public.kb_categories c WHERE c.slug = cand AND c.id <> r.id) LOOP
      cand := base || '-' || n; n := n + 1;
    END LOOP;
    IF r.slug IS DISTINCT FROM cand THEN
      UPDATE public.kb_categories SET slug = cand WHERE id = r.id;
      RAISE NOTICE 'kategori: % → %', r.slug, cand;
    END IF;
  END LOOP;
END $$;

SELECT slug AS makale_adresi, title FROM public.kb_articles ORDER BY created_at;
