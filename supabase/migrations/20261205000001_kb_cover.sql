-- BİLGİ BANKASI KAPAK GÖRSELİ (kullanıcı 2026-11-28: yazıdaki ilk görsel kartta alttan / üstten kırpılıyor, ne olduğu
-- anlaşılmıyor). Seçilen kapak + kartta görünüm (doldur / tamamı) + dikey konum. Boşsa eskisi gibi yazıdaki ilk görsel.
-- Kural: src/lib/kb-cover.ts; panelde canlı önizleme: src/components/admin/KbCoverPicker.tsx.
ALTER TABLE public.kb_articles
  ADD COLUMN IF NOT EXISTS cover_image text,
  ADD COLUMN IF NOT EXISTS cover_fit   text     NOT NULL DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS cover_pos_y smallint NOT NULL DEFAULT 50;

DO $$ BEGIN
  ALTER TABLE public.kb_articles ADD CONSTRAINT kb_articles_cover_fit_check CHECK (cover_fit IN ('cover', 'contain'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.kb_articles ADD CONSTRAINT kb_articles_cover_pos_y_check CHECK (cover_pos_y BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Site (anon) okur; yazma yine RLS'e (yalnız yönetici) bağlı
GRANT SELECT (cover_image, cover_fit, cover_pos_y) ON public.kb_articles TO anon, authenticated;
GRANT INSERT (cover_image, cover_fit, cover_pos_y), UPDATE (cover_image, cover_fit, cover_pos_y) ON public.kb_articles TO authenticated;

NOTIFY pgrst, 'reload schema';
