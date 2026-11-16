-- SITE İÇERİĞİ + YORUM GÖRSELİ (güvenlik taraması 2026-11-16, 5. parça düşük notlar 2 ve 3). Tekrar çalıştırmak güvenli.
--
-- 1) site_content: "Giriş yapan kullanıcılar yazabilir" kuralı her üyeye tam yazma veriyordu (bugün hiçbir sayfa okumuyor
--    ama tekrar kullanılırsa sayfaya kod gömme yolu olurdu) → yazma yalnız yönetici; okuma herkese açık kalır.
-- 2) Yorum görseli: üye tarayıcıdan product-images/reviews/<kendi id>/ klasörüne sınırsız (dosya başına 10 MB) yükleyip
--    disk doldurabiliyordu. Yükleme artık sunucudan (/api/review-images: dosya başına 5 MB, gerçek görsel türü kontrolü,
--    üye başına 24 saatte 20 görsel) → üyenin depoya doğrudan yazma kuralı kaldırılır.
-- 3) order_reviews ekleme kuralı: en çok 5 görsel ve hepsi üyenin KENDİ yorum klasöründen (dışarıdan adres konamaz).

-- 1) site_content
DROP POLICY IF EXISTS "Authenticated write site_content" ON public.site_content;
DROP POLICY IF EXISTS site_content_admin_write ON public.site_content;
CREATE POLICY site_content_admin_write ON public.site_content
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 2) Depo: üye yorum klasörüne doğrudan yazamaz (yönetici kuralı yh_storage_admin_all aynen kalır)
DROP POLICY IF EXISTS yh_storage_review_own ON storage.objects;

-- 3) Yorum ekleme: 20261190'daki kural + görsel sınırı
DROP POLICY IF EXISTS "user_insert_own_review" ON public.order_reviews;
CREATE POLICY "user_insert_own_review" ON public.order_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND is_approved = false
    AND admin_note IS NULL
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid())
    AND coalesce(cardinality(images), 0) <= 5
    AND NOT EXISTS (
      SELECT 1 FROM unnest(coalesce(images, '{}'::text[])) AS u(url)
      WHERE position(('/storage/v1/object/public/product-images/reviews/' || auth.uid()::text || '/') IN u.url) = 0
    )
  );
