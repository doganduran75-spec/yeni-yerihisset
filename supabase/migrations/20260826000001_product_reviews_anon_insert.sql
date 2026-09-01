-- product_reviews artık salt-okunur (legacy). Ürün sayfasındaki anonim yorum
-- formu kaldırıldı; yorumlar order_reviews üzerinden (yalnızca satın alanlar
-- tarafından) ekleniyor ve admin onayından geçiyor.
-- Bu tabloya artık ekleme yapılmadığı için INSERT politikalarını kaldırıyoruz.
DROP POLICY IF EXISTS "Herkes yorum ekleyebilir" ON public.product_reviews;
DROP POLICY IF EXISTS "Authenticated users can create reviews" ON public.product_reviews;
