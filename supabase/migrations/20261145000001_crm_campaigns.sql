-- CRM › KAMPANYALAR (kullanıcı kararları 2026-10-24):
--   kitle (aldığı marka / kategori, son alışveriş, etiket, yakın zamanda e-posta alan elenir) → kişiye özel kupon
--   (marka / kategori kapsamlı; SÜRE ATANDIĞI ANDAN başlar → user_coupons.expires_at) → e-posta (yalnız kampanya
--   izni olana) → rapor (atanan, gönderilen, kullanan, ciro).
--   Kuponun bitmesine 3 gün kala hatırlatma: BÜTÜN kişiye özel kuponlar, yalnız izinli + kullanılmamış, bir kez.

-- Kişiye özel süre + hatırlatma + hangi kampanyadan
ALTER TABLE public.user_coupons
  ADD COLUMN IF NOT EXISTS expires_at  timestamptz,
  ADD COLUMN IF NOT EXISTS reminded_at timestamptz,
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.email_campaigns(id) ON DELETE SET NULL;

ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS coupon_id      uuid REFERENCES public.coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audience       jsonb;

-- Kitle: üyeler + satın alma özeti. Alışveriş = site siparişi, ödenmiş (kısmi iade dahil), iptal değil.
CREATE OR REPLACE FUNCTION public.crm_campaign_audience(
  p_brands uuid[] DEFAULT NULL, p_categories uuid[] DEFAULT NULL,
  p_purchase text DEFAULT 'any',            -- any | buyers | non_buyers
  p_min_days int DEFAULT NULL,              -- son alışverişi en az N gün önce
  p_max_days int DEFAULT NULL,              -- son alışverişi en çok N gün önce
  p_tag uuid DEFAULT NULL)
RETURNS TABLE (user_id uuid, email text, first_name text, last_name text, consent boolean,
               last_order_at timestamptz, order_count int, last_mailed_at timestamptz, active_coupons text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH buys AS (
    SELECT o.user_id, max(o.created_at) AS last_at, count(*)::int AS n
      FROM orders o
     WHERE o.user_id IS NOT NULL AND coalesce(o.channel, 'site') = 'site' AND o.status <> 'cancelled'
       AND o.payment_status IN ('paid', 'partial_refund')
     GROUP BY o.user_id
  ), matched AS (
    SELECT DISTINCT o.user_id
      FROM orders o JOIN order_items i ON i.order_id = o.id JOIN products p ON p.id = i.product_id
     WHERE o.user_id IS NOT NULL AND coalesce(o.channel, 'site') = 'site' AND o.status <> 'cancelled'
       AND o.payment_status IN ('paid', 'partial_refund')
       AND (p_brands IS NULL OR p.brand_id = ANY (p_brands))
       AND (p_categories IS NULL OR p.category_id = ANY (p_categories))
  )
  SELECT pr.id, pr.email, pr.first_name, pr.last_name, coalesce(pr.marketing_consent, false),
         b.last_at, coalesce(b.n, 0),
         (SELECT max(q.sent_at) FROM email_queue q WHERE lower(q.recipient_email) = lower(pr.email) AND q.status = 'sent'
             AND coalesce(q.kind, 'campaign') = 'campaign'),
         (SELECT string_agg(c.name, ', ' ORDER BY c.name) FROM user_coupons uc JOIN coupons c ON c.id = uc.coupon_id
           WHERE uc.user_id = pr.id AND c.is_active AND uc.use_count < coalesce(uc.max_uses, c.per_user_limit, 1)
             AND coalesce(least(uc.expires_at, c.expires_at), uc.expires_at, c.expires_at, 'infinity'::timestamptz) > now())
    FROM profiles pr
    LEFT JOIN buys b ON b.user_id = pr.id
   WHERE pr.email IS NOT NULL AND coalesce(pr.role, 'user') <> 'admin'
     AND (p_purchase <> 'buyers' OR b.user_id IS NOT NULL)
     AND (p_purchase <> 'non_buyers' OR b.user_id IS NULL)
     AND ((p_brands IS NULL AND p_categories IS NULL) OR pr.id IN (SELECT m.user_id FROM matched m))
     AND (p_min_days IS NULL OR b.last_at <= now() - make_interval(days => p_min_days))
     AND (p_max_days IS NULL OR b.last_at >= now() - make_interval(days => p_max_days))
     AND (p_tag IS NULL OR EXISTS (SELECT 1 FROM user_tags t WHERE t.user_id = pr.id AND t.tag_option_id = p_tag))
   ORDER BY b.last_at DESC NULLS LAST
   LIMIT 5000
$$;
REVOKE ALL ON FUNCTION public.crm_campaign_audience(uuid[], uuid[], text, int, int, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_campaign_audience(uuid[], uuid[], text, int, int, uuid) TO service_role;

-- 3 gün kala hatırlatılacak kişiye özel kuponlar (izinli, kullanılmamış, hatırlatılmamış)
CREATE OR REPLACE FUNCTION public.coupons_to_remind(p_days int DEFAULT 3)
RETURNS TABLE (uc_id uuid, user_id uuid, email text, first_name text, coupon_name text, coupon_type text,
               amount numeric, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT uc.id, uc.user_id, pr.email, pr.first_name, c.name, c.type, c.amount,
         coalesce(least(uc.expires_at, c.expires_at), uc.expires_at, c.expires_at)
    FROM user_coupons uc JOIN coupons c ON c.id = uc.coupon_id JOIN profiles pr ON pr.id = uc.user_id
   WHERE uc.reminded_at IS NULL AND c.is_active AND c.is_personal AND pr.marketing_consent IS TRUE AND pr.email IS NOT NULL
     AND uc.use_count < coalesce(uc.max_uses, c.per_user_limit, 1)
     AND coalesce(least(uc.expires_at, c.expires_at), uc.expires_at, c.expires_at) BETWEEN now() AND now() + make_interval(days => p_days)
   LIMIT 200
$$;
REVOKE ALL ON FUNCTION public.coupons_to_remind(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coupons_to_remind(int) TO service_role;
