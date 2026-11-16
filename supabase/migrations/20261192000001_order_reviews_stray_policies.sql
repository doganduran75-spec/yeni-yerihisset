-- Yorum tablosunda elle eklenmiş eski kurallar (migration dosyalarında yok; regresyon 2026-11-16 yakaladı).
-- Kurallar VEYA ile birleştiği için "order_reviews_insert_own" (yalnız auth.uid() = user_id) MIG 20261190/20261191'deki
-- sıkı ekleme kuralını boşa çıkarıyordu: üye hâlâ onaylı yorum / başkasının siparişine yorum ekleyebiliyordu.
-- order_reviews_select_own = user_read_own_reviews'in kopyası. order_reviews_service gereksiz (service_role RLS'e takılmaz).
-- Kalanlar: admin_all_reviews, public_approved_reviews, user_read_own_reviews, user_insert_own_review. Tekrar çalıştırmak güvenli.

DROP POLICY IF EXISTS "order_reviews_insert_own" ON public.order_reviews;
DROP POLICY IF EXISTS "order_reviews_select_own" ON public.order_reviews;
DROP POLICY IF EXISTS "order_reviews_service" ON public.order_reviews;
