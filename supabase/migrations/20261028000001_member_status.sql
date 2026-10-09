-- ÜYELİK DURUMU — İKİ EKSEN (kullanıcı kararı 2026-10-09)
--   A) Hesap durumu : guest (şifresiz) · unverified (şifre var, e-posta doğrulanmadı) · member (şifre + doğrulanmış)
--   B) Alışveriş    : Müşteri (≥1 ödenmiş sipariş) · Müdavim (≥N) — refresh_member_auto_tags (değişmedi)
-- "Üye" (uye) rolü artık HERKESE verilmez: yalnız A = member olanlarda bulunur (kendiliğinden eklenir/kaldırılır).
-- Ayrıcalıklar (Fırsatlar seviyesi, hoş geldin kuponu, iş ortaklığı) yalnız member'da açılır:
--   seviye = member değilse 0, member ise max(1, rollerin seviyesi) → Üye 1, Müşteri 2, Müdavim 3.
-- Sipariş, giriş, Hesabım doğrulamadan BAĞIMSIZ (satış engellenmez).

-- 1) Hesap durumu
CREATE OR REPLACE FUNCTION public.member_account_state(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT CASE
    WHEN u.id IS NULL THEN 'none'
    WHEN coalesce(u.encrypted_password, '') = '' THEN 'guest'
    WHEN coalesce(p.email_verified, false) THEN 'member'
    ELSE 'unverified'
  END
  FROM (SELECT p_user AS id) x
  LEFT JOIN auth.users u ON u.id = x.id
  LEFT JOIN public.profiles p ON p.id = x.id
$$;

-- 2) Ayrıcalık seviyesi (Fırsatlar)
CREATE OR REPLACE FUNCTION public.member_level(p_user uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.member_account_state(p_user) <> 'member' THEN 0
    ELSE greatest(1, coalesce((SELECT max(r.level) FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = p_user), 0))
  END
$$;

-- Tarayıcı için: oturumdaki kullanıcının durumu + seviyesi (başkasınınkini soramaz)
CREATE OR REPLACE FUNCTION public.my_member_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('state', public.member_account_state(auth.uid()), 'level', public.member_level(auth.uid()))
$$;

REVOKE ALL ON FUNCTION public.member_account_state(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.member_level(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_account_state(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.member_level(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.my_member_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_member_status() TO authenticated, service_role;

-- 3) "Üye" rolünü durumla eşitle
CREATE OR REPLACE FUNCTION public.refresh_member_status(p_user uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_state text; v_uye uuid;
BEGIN
  v_state := public.member_account_state(p_user);
  SELECT id INTO v_uye FROM public.roles WHERE slug = 'uye' LIMIT 1;
  IF v_uye IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user) THEN RETURN v_state; END IF;
  IF v_state = 'member' THEN
    INSERT INTO public.user_roles (user_id, role_id) VALUES (p_user, v_uye) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = p_user AND role_id = v_uye;
  END IF;
  RETURN v_state;
END $$;
REVOKE ALL ON FUNCTION public.refresh_member_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_member_status(uuid) TO service_role;

-- Eski davranış: her yeni profile otomatik "Üye" → kaldır
DROP TRIGGER IF EXISTS on_profile_created_assign_role ON public.profiles;

-- Tetikleyiciler: profil oluşunca / e-posta doğrulanınca / şifre belirlenince
CREATE OR REPLACE FUNCTION public.trg_profiles_member_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.refresh_member_status(NEW.id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_profiles_member_status ON public.profiles;
CREATE TRIGGER trg_profiles_member_status
  AFTER INSERT OR UPDATE OF email_verified ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_profiles_member_status();

CREATE OR REPLACE FUNCTION public.trg_auth_users_member_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password THEN
    PERFORM public.refresh_member_status(NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_auth_users_member_status ON auth.users;
CREATE TRIGGER trg_auth_users_member_status
  AFTER UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.trg_auth_users_member_status();

-- 4) Mevcut hesapları yeni kurala göre düzelt
DELETE FROM public.user_roles ur USING public.roles r
 WHERE ur.role_id = r.id AND r.slug = 'uye' AND public.member_account_state(ur.user_id) <> 'member';
INSERT INTO public.user_roles (user_id, role_id)
SELECT p.id, r.id FROM public.profiles p CROSS JOIN public.roles r
 WHERE r.slug = 'uye' AND public.member_account_state(p.id) = 'member'
ON CONFLICT DO NOTHING;

-- 5) Admin üye listesi: hesap durumu sütunu
DROP FUNCTION IF EXISTS public.admin_search_members(text, uuid, uuid, text, int, int);
CREATE FUNCTION public.admin_search_members(
  p_q text DEFAULT NULL,
  p_role uuid DEFAULT NULL,
  p_tag uuid DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
) RETURNS TABLE (
  id uuid, email text, first_name text, last_name text, phone text, city text,
  created_at timestamptz, email_verified boolean, last_active_at timestamptz,
  import_source text, order_count bigint, total bigint, account_state text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  words text[] := ARRAY(SELECT w FROM regexp_split_to_table(lower(trim(coalesce(p_q, ''))), '\s+') w WHERE w <> '');
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  RETURN QUERY
  SELECT p.id, p.email, p.first_name, p.last_name, p.phone, p.city,
         p.created_at, p.email_verified, p.last_active_at, p.import_source,
         (SELECT count(*) FROM public.orders o WHERE o.user_id = p.id) AS order_count,
         count(*) OVER () AS total,
         public.member_account_state(p.id) AS account_state
  FROM public.profiles p
  WHERE (p_role IS NULL OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role_id = p_role))
    AND (p_tag IS NULL OR EXISTS (SELECT 1 FROM public.user_tags ut WHERE ut.user_id = p.id AND ut.tag_option_id = p_tag))
    AND (p_source IS NULL
         OR (p_source = 'legacy' AND p.import_source IS NOT NULL)
         OR (p_source = 'new' AND p.import_source IS NULL)
         OR p.import_source = p_source)
    AND NOT EXISTS (
      SELECT 1 FROM unnest(words) w
      WHERE position(w IN lower(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '') || ' ' ||
                                coalesce(p.email, '') || ' ' || coalesce(p.phone, ''))) = 0
    )
  ORDER BY p.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END $$;
REVOKE ALL ON FUNCTION public.admin_search_members(text, uuid, uuid, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_members(text, uuid, uuid, text, int, int) TO authenticated;

SELECT public.member_account_state(p.id) AS hesap_durumu, count(*) AS kisi
  FROM public.profiles p GROUP BY 1 ORDER BY 1;
