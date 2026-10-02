-- ============================================================
-- Eski site sahte üyelerini SİL (Admin › Üyeler › Eski site üyelerini incele)
-- ============================================================
-- Önceki sürüm hesap servisi (GoTrue deleteUser) ile siliyordu; servis veritabanı
-- hatasını gizleyip yalnız "silinemedi" döndürüyordu. Silme artık doğrudan veritabanında
-- (temizlik aracı gibi). Her hesap AYRI denenir: biri hata verirse diğerleri silinir ve
-- atlananın GERÇEK nedeni döner. Koşullar burada yeniden doğrulanır: aktarılmış,
-- yönetici değil, siparişi yok. Silinen e-posta "bir daha aktarma" listesine yazılır.

CREATE OR REPLACE FUNCTION public.admin_delete_legacy_members(
  p_ids uuid[],
  p_reasons jsonb DEFAULT '{}'::jsonb,
  p_admin uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE
  r record;
  n int := 0;
  skipped jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.is_admin() OR coalesce(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Yetkisiz';
  END IF;

  FOR r IN
    SELECT p.id, p.email, p.role, p.import_source,
           EXISTS (SELECT 1 FROM public.orders o WHERE o.user_id = p.id) AS has_orders
    FROM public.profiles p WHERE p.id = ANY (p_ids)
  LOOP
    IF r.role = 'admin' THEN
      skipped := skipped || jsonb_build_object('email', r.email, 'reason', 'yönetici hesabı');
    ELSIF r.import_source IS NULL THEN
      skipped := skipped || jsonb_build_object('email', r.email, 'reason', 'eski siteden aktarılmış değil');
    ELSIF r.has_orders THEN
      skipped := skipped || jsonb_build_object('email', r.email, 'reason', 'siparişi var');
    ELSE
      BEGIN
        IF coalesce(r.email, '') <> '' THEN
          INSERT INTO public.legacy_import_blocklist (email, reason, created_by)
          VALUES (lower(r.email), left(coalesce(p_reasons ->> r.id::text, 'admin: sahte üye'), 300),
                  CASE WHEN EXISTS (SELECT 1 FROM public.profiles a WHERE a.id = p_admin) THEN p_admin END)
          ON CONFLICT (email) DO NOTHING;
        END IF;
        DELETE FROM auth.users WHERE id = r.id;   -- profil, adres, rol, etiket… CASCADE
        n := n + 1;
      EXCEPTION WHEN others THEN
        skipped := skipped || jsonb_build_object('email', r.email, 'reason', 'veritabanı hatası: ' || SQLERRM);
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('deleted', n, 'skipped', skipped);
END $$;

REVOKE ALL ON FUNCTION public.admin_delete_legacy_members(uuid[], jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_legacy_members(uuid[], jsonb, uuid) TO authenticated, service_role;

SELECT 'admin_delete_legacy_members hazır' AS durum;
