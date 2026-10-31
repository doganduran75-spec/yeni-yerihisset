-- PANO "KİŞİLER" KARTI (kullanıcı kararı 2026-10-31): herkes YALNIZ BİR grupta sayılır, öncelik sırası
--   Yönetici › Affiliate › Müdavim › Müşteri › Üye › Kişi
--   * Müşteri : ödenmiş (iptal olmamış) siparişi var  (ya da Müşteri rolü)
--   * Üye     : şifresini belirlemiş, e-postası doğrulanmış hesap (siparişi yok)
--   * Kişi    : siteye üye olmamış — stok bildirimi / kampanya için e-posta bırakmış (şifresiz hesap ya da
--               hesaba bağlanmamış kişi kaydı), e-postası doğrulanmamış hesap. Şifre belirleyip doğrulayınca Üye'ye geçer.
-- Roller (user_roles) etiket olarak kalır (fırsat seviyeleri vb.); bu fonksiyon yalnız SAYIM içindir.
-- "Son 30 gün": o gruba geçiş anı — rol atanma, ilk ödenmiş sipariş, hesap / kayıt açılışı.
CREATE OR REPLACE FUNCTION public.people_tiers()
RETURNS TABLE (tier text, total int, new30 int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  WITH r AS (
    SELECT ur.user_id, ro.slug, ur.assigned_at FROM user_roles ur JOIN roles ro ON ro.id = ur.role_id
  ), firstbuy AS (
    SELECT o.user_id, min(o.created_at) AS at FROM orders o
     WHERE o.user_id IS NOT NULL AND o.status <> 'cancelled' AND o.payment_status IN ('paid', 'partial_refund')
     GROUP BY o.user_id
  ), p AS (
    SELECT pr.id, pr.created_at,
      CASE
        WHEN pr.role = 'admin' OR EXISTS (SELECT 1 FROM r WHERE r.user_id = pr.id AND r.slug IN ('yonetici', 'admin')) THEN 'yonetici'
        WHEN EXISTS (SELECT 1 FROM affiliate_profiles ap WHERE ap.user_id = pr.id AND ap.status = 'active')
          OR EXISTS (SELECT 1 FROM r WHERE r.user_id = pr.id AND r.slug = 'affiliate') THEN 'affiliate'
        WHEN EXISTS (SELECT 1 FROM r WHERE r.user_id = pr.id AND r.slug = 'mudavim') THEN 'mudavim'
        WHEN fb.user_id IS NOT NULL OR EXISTS (SELECT 1 FROM r WHERE r.user_id = pr.id AND r.slug = 'musteri') THEN 'musteri'
        WHEN coalesce(u.encrypted_password, '') <> '' AND coalesce(pr.email_verified, false) THEN 'uye'
        ELSE 'kisi'
      END AS tier,
      fb.at AS first_buy
    FROM profiles pr
    LEFT JOIN auth.users u ON u.id = pr.id
    LEFT JOIN firstbuy fb ON fb.user_id = pr.id
    WHERE pr.deleted_at IS NULL
  ), people AS (
    SELECT p.tier,
      CASE p.tier
        WHEN 'musteri' THEN coalesce(p.first_buy, (SELECT max(r.assigned_at) FROM r WHERE r.user_id = p.id AND r.slug = 'musteri'))
        WHEN 'mudavim' THEN (SELECT max(r.assigned_at) FROM r WHERE r.user_id = p.id AND r.slug = 'mudavim')
        WHEN 'affiliate' THEN coalesce((SELECT max(r.assigned_at) FROM r WHERE r.user_id = p.id AND r.slug = 'affiliate'), p.created_at)
        ELSE p.created_at
      END AS since
    FROM p
    UNION ALL
    -- Hesaba bağlanmamış kişi kayıtları (Instagram / telefon / e-posta ile stok bildirimi vb.)
    SELECT 'kisi', c.created_at FROM contacts c WHERE c.linked_user_id IS NULL
  )
  SELECT t.tier, coalesce(count(pe.tier), 0)::int, coalesce(count(pe.tier) FILTER (WHERE pe.since >= now() - interval '30 days'), 0)::int
    FROM (VALUES ('yonetici', 1), ('affiliate', 2), ('mudavim', 3), ('musteri', 4), ('uye', 5), ('kisi', 6)) AS t(tier, ord)
    LEFT JOIN people pe ON pe.tier = t.tier
   GROUP BY t.tier, t.ord ORDER BY t.ord
$$;
REVOKE ALL ON FUNCTION public.people_tiers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.people_tiers() TO service_role;
