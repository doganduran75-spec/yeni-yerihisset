-- Ürün yorumları: herkes (giriş yapmamış ziyaretçi dahil) yorum ekleyebilsin.
-- Eski politika "auth.uid() = user_id" istiyordu; form ise anonim (isim elle
-- giriliyor, user_id gönderilmiyor) olduğundan hiçbir yorum kaydedilemiyordu.
DROP POLICY IF EXISTS "Authenticated users can create reviews" ON public.product_reviews;

CREATE POLICY "Herkes yorum ekleyebilir"
  ON public.product_reviews
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
