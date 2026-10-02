-- ============================================================
-- Admin › Üyeler: sunucu tarafı arama + sayfalama
-- ============================================================
-- Sayfa artık tüm üyeleri tarayıcıya çekmez (aktarımla ~900+ üye). Arama/filtre ile
-- 50'şer satır gelir. Arama: her kelime ad + soyad + e-posta + telefon içinde geçmeli
-- ("ali veli", "gmail", "532"). Filtre: rol, etiket, kaynak (legacy = eski siteden
-- aktarılan, new = yeni sitede açılan, ya da woo_yerihisset / woo_attipas).
-- total: filtreye uyan toplam (sayfalama için). Yalnız admin.

CREATE OR REPLACE FUNCTION public.admin_search_members(
  p_q text DEFAULT NULL,
  p_role uuid DEFAULT NULL,
  p_tag uuid DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
) RETURNS TABLE (
  id uuid, email text, first_name text, last_name text, phone text, city text,
  created_at timestamptz, email_verified boolean, last_active_at timestamptz,
  import_source text, order_count bigint, total bigint
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
         count(*) OVER () AS total
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

SELECT 'admin_search_members hazır' AS durum;
