-- ============================================================
-- Admin › Üyeler: "Durum" (misafir / doğrulanmamış / üye) + "Sipariş" (var / yok) süzgeci ve SİLME
-- ============================================================
-- Kullanıcı (2026-10-14): eski siteden gelen, gözden kaçmış misafir hesapları temizlemek istiyor.
-- Silme kuralları: yalnız yönetici; yönetici hesabı silinmez; SİPARİŞİ OLAN hesap silinmez (sipariş / fatura /
-- ciro kaydı müşteriye bağlı kalmalı). Silinen hesabın bağlı kişi kaydı (contacts.linked_user_id) da silinir.
-- auth.users silinince profil ve bağlı kayıtlar (adres, rol, etiket, favori…) FK kuralıyla gider.

DROP FUNCTION IF EXISTS public.admin_search_members(text, uuid, uuid, text, int, int);
CREATE OR REPLACE FUNCTION public.admin_search_members(
  p_q text DEFAULT NULL,
  p_role uuid DEFAULT NULL,
  p_tag uuid DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_state text DEFAULT NULL,    -- guest | unverified | member
  p_orders text DEFAULT NULL    -- none | some
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
  WITH base AS (
    SELECT p.*, public.member_account_state(p.id) AS st,
           (SELECT count(*) FROM public.orders o WHERE o.user_id = p.id) AS oc
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
  )
  SELECT b.id, b.email, b.first_name, b.last_name, b.phone, b.city,
         b.created_at, b.email_verified, b.last_active_at, b.import_source,
         b.oc AS order_count, count(*) OVER () AS total, b.st AS account_state
  FROM base b
  WHERE (p_state IS NULL OR b.st = p_state)
    AND (p_orders IS NULL OR (p_orders = 'none' AND b.oc = 0) OR (p_orders = 'some' AND b.oc > 0))
  ORDER BY b.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END $$;
REVOKE ALL ON FUNCTION public.admin_search_members(text, uuid, uuid, text, int, int, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_members(text, uuid, uuid, text, int, int, text, text) TO authenticated;

-- Silme: siparişi olan / yönetici hesaplar atlanır (sebebiyle döner)
CREATE OR REPLACE FUNCTION public.admin_delete_members(p_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE r record; n int := 0; skipped jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  IF coalesce(array_length(p_ids, 1), 0) > 500 THEN RAISE EXCEPTION 'Tek seferde en çok 500 hesap'; END IF;
  FOR r IN
    SELECT p.id, p.email, p.role,
           EXISTS (SELECT 1 FROM public.orders o WHERE o.user_id = p.id) AS has_orders
      FROM public.profiles p WHERE p.id = ANY(p_ids)
  LOOP
    IF r.id = auth.uid() OR r.role = 'admin' THEN
      skipped := skipped || jsonb_build_object('email', r.email, 'reason', 'yönetici hesabı');
    ELSIF r.has_orders THEN
      skipped := skipped || jsonb_build_object('email', r.email, 'reason', 'siparişi var');
    ELSE
      DELETE FROM public.contacts WHERE linked_user_id = r.id;
      DELETE FROM auth.users WHERE id = r.id;
      DELETE FROM public.profiles WHERE id = r.id;  -- auth kaydı yoksa (eski veri) profil yine gitsin
      n := n + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('deleted', n, 'skipped', skipped);
END $$;
REVOKE ALL ON FUNCTION public.admin_delete_members(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_members(uuid[]) TO authenticated;
