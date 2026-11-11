-- TOPLULUK KATMANLARI (kullanıcı kararı 2026-11-11): Üye · Barefoot Meraklısı · Barefoot Tutkunu · Barefoot Gurusu.
-- Kısa adlar (slug) aynı kalır — kod ve fırsat seviyeleri onlara bağlı: musteri = Meraklı (≥1 ödenmiş sipariş),
-- mudavim = Tutkun (≥N, Ayarlar › Roller, varsayılan 2). Yeni: guru (seviye 4) = kendi ödenmiş siparişi + iş ortağı
-- olarak en az 1 ödenmiş satış (kendi siparişi değil); panelden elle de atanabilir. Roller geri alınmaz.
UPDATE public.roles SET name = 'Barefoot Meraklısı' WHERE slug = 'musteri';
UPDATE public.roles SET name = 'Barefoot Tutkunu'   WHERE slug = 'mudavim';
INSERT INTO public.roles (name, slug, level) VALUES ('Barefoot Gurusu', 'guru', 4)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, level = 4;

CREATE OR REPLACE FUNCTION public.refresh_member_auto_tags(p_user_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_role uuid;
  v_size_group text;
  n_roles int := 0;
  n_tags int := 0;
  v_mud uuid;
  v_min int;
  n_mud int := 0;
  v_guru uuid;
  n_guru int := 0;
BEGIN
  SELECT id INTO v_role FROM public.roles WHERE slug = 'musteri' LIMIT 1;
  SELECT id INTO v_mud FROM public.roles WHERE slug = 'mudavim' LIMIT 1;
  SELECT id INTO v_guru FROM public.roles WHERE slug = 'guru' LIMIT 1;
  SELECT coalesce((SELECT mudavim_min_orders FROM public.settings LIMIT 1), 2) INTO v_min;
  SELECT name INTO v_size_group FROM public.variant_groups WHERE lower(name) LIKE 'numara%' ORDER BY length(name) LIMIT 1;
  v_size_group := coalesce(v_size_group, 'Numara');

  -- 1) Barefoot Meraklısı (slug musteri) rolü
  IF v_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    SELECT DISTINCT o.user_id, v_role
    FROM public.orders o
    WHERE o.user_id IS NOT NULL AND o.payment_status IN ('paid', 'partial_refund') AND o.status <> 'cancelled'
      AND (p_user_ids IS NULL OR o.user_id = ANY (p_user_ids))
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = o.user_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
    GET DIAGNOSTICS n_roles = ROW_COUNT;
  END IF;

  -- 1b) Barefoot Tutkunu (slug mudavim): en az N ödenmiş, iptal edilmemiş sipariş (N = settings.mudavim_min_orders, varsayılan 2)
  IF v_mud IS NOT NULL AND v_min >= 2 THEN
    INSERT INTO public.user_roles (user_id, role_id)
    SELECT o.user_id, v_mud
    FROM public.orders o
    WHERE o.user_id IS NOT NULL AND o.payment_status IN ('paid', 'partial_refund') AND o.status <> 'cancelled'
      AND (p_user_ids IS NULL OR o.user_id = ANY (p_user_ids))
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = o.user_id)
    GROUP BY o.user_id
    HAVING count(*) >= v_min
    ON CONFLICT (user_id, role_id) DO NOTHING;
    GET DIAGNOSTICS n_mud = ROW_COUNT;
  END IF;

  -- 1c) Barefoot Gurusu (kullanıcı kararı 2026-11-11): kendisi en az 1 ödenmiş siparişi var VE iş ortağı (affiliate) olarak
  --     en az 1 ödenmiş, iptal edilmemiş satış getirmiş (kendi siparişi sayılmaz). Panelden elle de atanabilir.
  IF v_guru IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    SELECT DISTINCT ap.user_id, v_guru
    FROM public.affiliate_profiles ap
    WHERE ap.user_id IS NOT NULL
      AND (p_user_ids IS NULL OR ap.user_id = ANY (p_user_ids))
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = ap.user_id)
      AND EXISTS (SELECT 1 FROM public.orders o WHERE o.user_id = ap.user_id
                   AND o.payment_status IN ('paid', 'partial_refund') AND o.status <> 'cancelled')
      AND EXISTS (SELECT 1 FROM public.orders s WHERE s.affiliate_id = ap.id
                   AND s.user_id IS DISTINCT FROM ap.user_id
                   AND s.payment_status IN ('paid', 'partial_refund') AND s.status <> 'cancelled')
    ON CONFLICT (user_id, role_id) DO NOTHING;
    GET DIAGNOSTICS n_guru = ROW_COUNT;
  END IF;

  -- 2) Etiket adayları (aynı işlemde birden fazla çağrılabilir → önce sil)
  DROP TABLE IF EXISTS _auto_tag_e;
  CREATE TEMP TABLE _auto_tag_e ON COMMIT DROP AS
  WITH it AS (
    SELECT o.user_id, oi.product_id, oi.variant_id, oi.title, oi.size_label
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.user_id IS NOT NULL AND o.payment_status IN ('paid', 'partial_refund') AND o.status <> 'cancelled'
      AND (p_user_ids IS NULL OR o.user_id = ANY (p_user_ids))
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = o.user_id)
  )
  SELECT DISTINCT user_id, g, v FROM (
    SELECT it.user_id, 'Kategori'::text AS g, c.name AS v
      FROM it JOIN public.products pr ON pr.id = it.product_id JOIN public.categories c ON c.id = pr.category_id
    UNION ALL
    SELECT it.user_id, 'Marka', b.name
      FROM it JOIN public.products pr ON pr.id = it.product_id JOIN public.brands b ON b.id = pr.brand_id
    UNION ALL
    SELECT it.user_id, 'Marka', b.name
      FROM it JOIN public.brands b
        ON it.product_id IS NULL AND length(b.name) >= 3
       AND lower(coalesce(it.title, '')) LIKE lower(b.name) || ' %'
    UNION ALL
    SELECT it.user_id, vg.name, vo.value
      FROM it JOIN public.product_variants pv ON pv.id = it.variant_id
              JOIN public.variant_options vo ON vo.id = pv.variant_option_id
              JOIN public.variant_groups vg ON vg.id = vo.group_id
    UNION ALL
    SELECT it.user_id, v_size_group, trim(it.size_label)
      FROM it WHERE it.variant_id IS NULL AND coalesce(trim(it.size_label), '') <> ''
  ) x
  WHERE coalesce(trim(v), '') <> '';

  INSERT INTO public.member_tag_groups (name)
  SELECT DISTINCT g FROM _auto_tag_e ON CONFLICT (name) DO NOTHING;

  INSERT INTO public.member_tag_options (group_id, value)
  SELECT DISTINCT mg.id, e.v FROM _auto_tag_e e JOIN public.member_tag_groups mg ON mg.name = e.g
  ON CONFLICT (group_id, value) DO NOTHING;

  INSERT INTO public.user_tags (user_id, tag_option_id)
  SELECT DISTINCT e.user_id, mo.id
  FROM _auto_tag_e e
  JOIN public.member_tag_groups mg ON mg.name = e.g
  JOIN public.member_tag_options mo ON mo.group_id = mg.id AND mo.value = e.v
  ON CONFLICT (user_id, tag_option_id) DO NOTHING;
  GET DIAGNOSTICS n_tags = ROW_COUNT;

  DROP TABLE IF EXISTS _auto_tag_e;
  RETURN jsonb_build_object('roles_added', n_roles, 'mudavim_added', n_mud, 'guru_added', n_guru, 'tags_added', n_tags);
END $$;
REVOKE ALL ON FUNCTION public.refresh_member_auto_tags(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_member_auto_tags(uuid[]) TO service_role;

-- Tetikleyici: sipariş ödenince alıcının yanında, siparişi getiren iş ortağı da yeniden değerlendirilir (Guru)
CREATE OR REPLACE FUNCTION public.trg_orders_member_auto_tags()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_aff uuid;
BEGIN
  IF NEW.payment_status IN ('paid', 'partial_refund') AND NEW.status <> 'cancelled'
     AND (TG_OP = 'INSERT'
          OR OLD.payment_status IS DISTINCT FROM NEW.payment_status
          OR OLD.status IS DISTINCT FROM NEW.status
          OR OLD.user_id IS DISTINCT FROM NEW.user_id
          OR OLD.affiliate_id IS DISTINCT FROM NEW.affiliate_id) THEN
    IF NEW.user_id IS NOT NULL THEN PERFORM public.refresh_member_auto_tags(ARRAY[NEW.user_id]); END IF;
    IF NEW.affiliate_id IS NOT NULL THEN
      SELECT user_id INTO v_aff FROM public.affiliate_profiles WHERE id = NEW.affiliate_id;
      IF v_aff IS NOT NULL AND v_aff IS DISTINCT FROM NEW.user_id THEN PERFORM public.refresh_member_auto_tags(ARRAY[v_aff]); END IF;
    END IF;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_orders_member_auto_tags ON public.orders;
CREATE TRIGGER trg_orders_member_auto_tags
  AFTER INSERT OR UPDATE OF payment_status, status, user_id, affiliate_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_orders_member_auto_tags();

-- Pano "Kişiler" kartı: Guru en üstte (Guru'lar zaten iş ortağı olduğu için Affiliate'in üstünde olmalı)
--   Yönetici › Barefoot Gurusu › Affiliate › Barefoot Tutkunu › Barefoot Meraklısı › Üye › Kişi
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
        WHEN EXISTS (SELECT 1 FROM r WHERE r.user_id = pr.id AND r.slug = 'guru') THEN 'guru'
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
        WHEN 'guru' THEN (SELECT max(r.assigned_at) FROM r WHERE r.user_id = p.id AND r.slug = 'guru')
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
    FROM (VALUES ('yonetici', 1), ('guru', 2), ('affiliate', 3), ('mudavim', 4), ('musteri', 5), ('uye', 6), ('kisi', 7)) AS t(tier, ord)
    LEFT JOIN people pe ON pe.tier = t.tier
   GROUP BY t.tier, t.ord ORDER BY t.ord
$$;
REVOKE ALL ON FUNCTION public.people_tiers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.people_tiers() TO service_role;

-- Mevcut üyelere uygula (Guru ataması dahil)
SELECT 'Topluluk katmanları' AS adim, public.refresh_member_auto_tags() AS sonuc;
