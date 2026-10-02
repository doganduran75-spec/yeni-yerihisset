-- ============================================================
-- Üye OTOMATİK rol + etiket (her kanal için tek kural, veritabanında)
-- ============================================================
-- Kural: ödemesi alınmış (payment_status='paid') ve iptal edilmemiş en az bir siparişi olan
-- üye → "Müşteri" rolü. Aynı siparişlerdeki ürünlerden etiketler:
--   * eşleşmiş ürün: Kategori: <kategori>, Marka: <marka>, <varyant grubu>: <değer> (ör. Numara: 39)
--   * eşleşmemiş eski ürün: Numara: <eski sitedeki numara> (size_label) ve ürün adı bir marka
--     adıyla başlıyorsa Marka: <marka> ("Attipas Cool…" → Marka: Attipas; marka sitede tanımlıysa)
-- Önceden site siparişi OLUŞURKEN (ödenmeden) atanıyordu ve aktarılan siparişlerde hiç
-- çalışmıyordu. Artık tetikleyiciyle: sipariş ödendiğinde, satır eklendiğinde/eşleştiğinde.
-- Rol / etiket GERİ ALINMAZ (iptal/iade sonrası da kalır; admin elle kaldırabilir).

CREATE OR REPLACE FUNCTION public.refresh_member_auto_tags(p_user_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_role uuid;
  v_size_group text;
  n_roles int := 0;
  n_tags int := 0;
BEGIN
  SELECT id INTO v_role FROM public.roles WHERE slug = 'musteri' LIMIT 1;
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
  RETURN jsonb_build_object('roles_added', n_roles, 'tags_added', n_tags);
END $$;
REVOKE ALL ON FUNCTION public.refresh_member_auto_tags(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_member_auto_tags(uuid[]) TO authenticated, service_role;

-- Tetikleyici: sipariş ödendi / durumu ya da sahibi değişti
CREATE OR REPLACE FUNCTION public.trg_orders_member_auto_tags()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.payment_status = 'paid' AND NEW.status <> 'cancelled'
     AND (TG_OP = 'INSERT'
          OR OLD.payment_status IS DISTINCT FROM NEW.payment_status
          OR OLD.status IS DISTINCT FROM NEW.status
          OR OLD.user_id IS DISTINCT FROM NEW.user_id) THEN
    PERFORM public.refresh_member_auto_tags(ARRAY[NEW.user_id]);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_orders_member_auto_tags ON public.orders;
CREATE TRIGGER trg_orders_member_auto_tags
  AFTER INSERT OR UPDATE OF payment_status, status, user_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_orders_member_auto_tags();

-- Tetikleyici: sipariş satırı eklendi ya da sonradan bir ürüne eşleşti
CREATE OR REPLACE FUNCTION public.trg_order_items_member_auto_tags()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
  SELECT o.user_id INTO v_user FROM public.orders o
  WHERE o.id = NEW.order_id AND o.user_id IS NOT NULL AND o.payment_status = 'paid' AND o.status <> 'cancelled';
  IF v_user IS NOT NULL THEN
    PERFORM public.refresh_member_auto_tags(ARRAY[v_user]);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_order_items_member_auto_tags ON public.order_items;
CREATE TRIGGER trg_order_items_member_auto_tags
  AFTER INSERT OR UPDATE OF product_id, variant_id ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_order_items_member_auto_tags();

-- Geriye dönük: mevcut tüm müşteriler (aktarılanlar dahil)
SELECT 'Geriye dönük doldurma' AS adim, public.refresh_member_auto_tags() AS sonuc;
