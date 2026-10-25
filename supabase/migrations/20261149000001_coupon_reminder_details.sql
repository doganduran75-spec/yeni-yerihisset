-- Kupon hatırlatması (kullanıcı 2026-10-25): e-posta yeni kupon veriyormuş gibi değil, HANGİ kuponların bittiğini
-- göstersin (ad, indirim, kapsam, alt limit, bitiş) + sepete bağlantı. Kişi başına TEK e-posta (birden çok kupon
-- listelenir). Kapsam ve alt limit için alanlar eklendi (dönüş tipi değiştiğinden fonksiyon yeniden kuruluyor).
DROP FUNCTION IF EXISTS public.coupons_to_remind(int);
CREATE FUNCTION public.coupons_to_remind(p_days int DEFAULT 3)
RETURNS TABLE (uc_id uuid, user_id uuid, email text, first_name text, coupon_name text, coupon_type text,
               amount numeric, expires_at timestamptz, min_order_amount numeric, brand_ids uuid[], category_ids uuid[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT uc.id, uc.user_id, pr.email, pr.first_name, c.name, c.type, c.amount,
         coalesce(least(uc.expires_at, c.expires_at), uc.expires_at, c.expires_at),
         c.min_order_amount, c.brand_ids, c.category_ids
    FROM user_coupons uc JOIN coupons c ON c.id = uc.coupon_id JOIN profiles pr ON pr.id = uc.user_id
   WHERE uc.reminded_at IS NULL AND c.is_active AND c.is_personal AND pr.marketing_consent IS TRUE AND pr.email IS NOT NULL
     AND uc.use_count < coalesce(uc.max_uses, c.per_user_limit, 1)
     AND coalesce(least(uc.expires_at, c.expires_at), uc.expires_at, c.expires_at) BETWEEN now() AND now() + make_interval(days => p_days)
   ORDER BY uc.user_id
   LIMIT 200
$$;
REVOKE ALL ON FUNCTION public.coupons_to_remind(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coupons_to_remind(int) TO service_role;
