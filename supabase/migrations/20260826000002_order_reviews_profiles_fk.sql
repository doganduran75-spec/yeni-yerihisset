-- Admin "Yorumlar" sayfası, order_reviews ile birlikte yorumcunun profilini
-- (profiles) embed ederek çekiyor. Ancak order_reviews.user_id yalnızca
-- auth.users'a bağlıydı; profiles ile FK ilişkisi olmadığı için PostgREST
-- "Could not find a relationship between order_reviews and profiles" hatası
-- veriyor, sorgu boş dönüyor ve bekleyen yorumlar admin panelinde görünmüyordu.
--
-- profiles.id = auth.users.id olduğundan, embed'in çalışması için user_id'den
-- profiles'a bir FK ekliyoruz. NOT VALID: mevcut satırları yeniden doğrulamadan
-- ekler (PostgREST ilişkiyi yine de tanır).
ALTER TABLE public.order_reviews
  ADD CONSTRAINT order_reviews_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID;
