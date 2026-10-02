-- ============================================================
-- MÜDAVİM rolü: en az N ödenmiş, iptal edilmemiş sipariş (N ayarlanabilir, varsayılan 2)
-- ============================================================
-- refresh_member_auto_tags() Müşteri + etiketlerin yanında Müdavim'i de atar (aynı
-- tetikleyiciler: sipariş ödenince / satır eklenince). Eşik: settings.mudavim_min_orders
-- (Ayarlar › Roller). Roller GERİ ALINMAZ (eşik yükselirse mevcut Müdavimler kalır).
-- Fonksiyon artık tarayıcıdan çağrılamaz (yalnız sunucu / tetikleyiciler).

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS mudavim_min_orders int NOT NULL DEFAULT 2;

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
BEGIN
  SELECT id INTO v_role FROM public.roles WHERE slug = 'musteri' LIMIT 1;
  SELECT id INTO v_mud FROM public.roles WHERE slug = 'mudavim' LIMIT 1;
  SELECT coalesce((SELECT mudavim_min_orders FROM public.settings LIMIT 1), 2) INTO v_min;
  SELECT name INTO v_size_group FROM public.variant_groups WHERE lower(name) LIKE 'numara%' ORDER BY length(name) LIMIT 1;
  v_size_group := coalesce(v_size_group, 'Numara');

  -- 1) Müşteri rolü
  IF v_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    SELECT DISTINCT o.user_id, v_role
    FROM public.orders o
    WHERE o.user_id IS NOT NULL AND o.payment_status = 'paid' AND o.status <> 'cancelled'
      AND (p_user_ids IS NULL OR o.user_id = ANY (p_user_ids))
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = o.user_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
    GET DIAGNOSTICS n_roles = ROW_COUNT;
  END IF;

  -- 1b) Müdavim: en az N ödenmiş, iptal edilmemiş sipariş (N = settings.mudavim_min_orders, varsayılan 2)
  IF v_mud IS NOT NULL AND v_min >= 2 THEN
    INSERT INTO public.user_roles (user_id, role_id)
    SELECT o.user_id, v_mud
    FROM public.orders o
    WHERE o.user_id IS NOT NULL AND o.payment_status = 'paid' AND o.status <> 'cancelled'
      AND (p_user_ids IS NULL OR o.user_id = ANY (p_user_ids))
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = o.user_id)
    GROUP BY o.user_id
    HAVING count(*) >= v_min
    ON CONFLICT (user_id, role_id) DO NOTHING;
    GET DIAGNOSTICS n_mud = ROW_COUNT;
  END IF;

  -- 2) Etiket adayları (aynı işlemde birden fazla çağrılabilir → önce sil)
  DROP TABLE IF EXISTS _auto_tag_e;
  CREATE TEMP TABLE _auto_tag_e ON COMMIT DROP AS
  WITH it AS (
    SELECT o.user_id, oi.product_id, oi.variant_id, oi.title, oi.size_label
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.user_id IS NOT NULL AND o.payment_status = 'paid' AND o.status <> 'cancelled'
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
  RETURN jsonb_build_object('roles_added', n_roles, 'mudavim_added', n_mud, 'tags_added', n_tags);
END $$;
REVOKE ALL ON FUNCTION public.refresh_member_auto_tags(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_member_auto_tags(uuid[]) TO service_role;

-- Geriye dönük
SELECT 'Müdavim ataması' AS adim, public.refresh_member_auto_tags() AS sonuc;

SELECT r.name, r.slug, r.level, count(ur.user_id) AS uye
FROM public.roles r LEFT JOIN public.user_roles ur ON ur.role_id = r.id
WHERE r.slug IN ('musteri', 'mudavim')
GROUP BY r.id, r.name, r.slug, r.level ORDER BY r.level;
