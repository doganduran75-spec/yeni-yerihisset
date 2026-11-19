-- ELLE YORUM EKLEME (kullanıcı 2026-11-19: "ürün yorumlarına manuel ekleme yapabilmeliyim — eski yorumlar").
-- Yönetici panelden (Yorumlar › "Yorum ekle") siparişe bağlı olmayan yorum ekler: ürün + görünen ad + tarih + puan + yorum
-- (+ görsel). Bu yorumlarda sipariş / üye yok → order_id ve user_id boş olabilir, görünen ad author_name'de.
-- Üye yine yalnız kendi siparişine, kendi adıyla (author_name boş) onaysız yorum ekleyebilir.
-- Tekrar çalıştırmak güvenli.

ALTER TABLE public.order_reviews ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE public.order_reviews ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.order_reviews ADD COLUMN IF NOT EXISTS author_name text;
-- Yorumun kaynağı (elle eklenende): eski_site / instagram / trendyol / hepsiburada / amazon / whatsapp / diger —
-- ürün sayfasında adın yanında etiket (src/config/review-origins.ts)
ALTER TABLE public.order_reviews ADD COLUMN IF NOT EXISTS origin text;

-- Ya sipariş + üye ya da görünen ad olmalı (sahipsiz, adsız yorum olmasın)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_reviews_author_chk') THEN
    ALTER TABLE public.order_reviews ADD CONSTRAINT order_reviews_author_chk
      CHECK ((order_id IS NOT NULL AND user_id IS NOT NULL) OR length(trim(coalesce(author_name, ''))) > 0);
  END IF;
END $$;

-- Ürün bağı (panelde ürün adı görünsün; ürün silinirse yorum kalır, ürünsüz olur)
UPDATE public.order_reviews r SET product_id = NULL
  WHERE product_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = r.product_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_reviews_product_id_fkey') THEN
    ALTER TABLE public.order_reviews ADD CONSTRAINT order_reviews_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_order_reviews_product ON public.order_reviews(product_id);

-- Üye kuralı: görünen adı kendisi yazamaz (başkası adına yorum olmasın); geri kalanı MIG 20261191 ile aynı
DROP POLICY IF EXISTS "user_insert_own_review" ON public.order_reviews;
CREATE POLICY "user_insert_own_review" ON public.order_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND is_approved = false
    AND admin_note IS NULL
    AND author_name IS NULL
    AND origin IS NULL
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid())
    AND coalesce(cardinality(images), 0) <= 5
    AND NOT EXISTS (
      SELECT 1 FROM unnest(coalesce(images, '{}'::text[])) AS u(url)
      WHERE position(('/storage/v1/object/public/product-images/reviews/' || auth.uid()::text || '/') IN u.url) = 0
    )
  );

NOTIFY pgrst, 'reload schema';
