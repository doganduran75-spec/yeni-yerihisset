-- ============================================================
-- profiles / user_addresses ↔ auth.users BAĞLANTISI (sunucu taşınırken düşmüş)
-- ============================================================
-- Sorun: profiles.id → auth.users(id) ve user_addresses.user_id → auth.users(id) yabancı
-- anahtarları yoktu. Hesap silinince profil + adresler "sahipsiz" kalıyordu (2026-10-02:
-- 110 sahipsiz profil = temizlikte silinen 13 test hesabı + inceleme ekranında silinen 97).
-- Bu migration:
--   1) inceleme ekranında silinmiş (aktarılmış, siparişsiz) sahipsizleri "bir daha aktarma"
--      listesine GERİ yazar,
--   2) sahipsiz adresleri ve SİPARİŞİ OLMAYAN sahipsiz profilleri siler (roller/etiketler CASCADE),
--   3) eksik bağlantıları ON DELETE CASCADE ile ekler (sahipsiz kalmadıysa),
--   4) silme fonksiyonunu profili/adresleri AÇIKÇA da silecek şekilde günceller.
-- Tekrar çalıştırmak güvenli.

SELECT 'ÖNCE' AS an,
       (SELECT count(*) FROM public.profiles) AS profil,
       (SELECT count(*) FROM auth.users) AS hesap,
       (SELECT count(*) FROM public.profiles p WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)) AS sahipsiz_profil,
       (SELECT count(*) FROM public.user_addresses a WHERE a.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = a.user_id)) AS sahipsiz_adres;

-- 1) Ekrandan silinmiş eski site üyeleri → bir daha aktarılmasın
INSERT INTO public.legacy_import_blocklist (email, reason)
SELECT DISTINCT lower(p.email), 'admin: sahte üye'
FROM public.profiles p
WHERE p.import_source IS NOT NULL AND coalesce(p.email, '') <> ''
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.user_id = p.id)
ON CONFLICT (email) DO NOTHING;

-- 2) Sahipsiz adresler + siparişi olmayan sahipsiz profiller
DELETE FROM public.user_addresses a
WHERE a.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = a.user_id);

DELETE FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.user_id = p.id);

-- 3) Bağlantılar
DO $$
DECLARE left_over int;
BEGIN
  SELECT count(*) INTO left_over FROM public.profiles p WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);
  IF left_over > 0 THEN
    RAISE WARNING 'UYARI: siparişi olan % sahipsiz profil kaldı → profiles bağlantısı EKLENMEDİ (Claude''a bildir)', left_over;
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.profiles'::regclass AND contype = 'f'
                    AND confrelid = 'auth.users'::regclass) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'profiles → auth.users bağlantısı eklendi';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.user_addresses'::regclass AND contype = 'f'
                 AND confrelid = 'auth.users'::regclass) THEN
    ALTER TABLE public.user_addresses ADD CONSTRAINT user_addresses_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'user_addresses → auth.users bağlantısı eklendi';
  END IF;
END $$;

-- 4) Silme fonksiyonu: profil + adresleri AÇIKÇA da sil (bağlantıya güvenmeden)
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
        DELETE FROM public.user_addresses WHERE user_id = r.id;
        DELETE FROM public.profiles WHERE id = r.id;        -- roller, etiketler… CASCADE
        DELETE FROM auth.users WHERE id = r.id;
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

SELECT 'SONRA' AS an,
       (SELECT count(*) FROM public.profiles) AS profil,
       (SELECT count(*) FROM auth.users) AS hesap,
       (SELECT count(*) FROM public.profiles p WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)) AS sahipsiz_profil,
       (SELECT count(*) FROM public.legacy_import_blocklist) AS bir_daha_aktarma,
       (SELECT count(*) FROM pg_constraint WHERE confrelid = 'auth.users'::regclass
          AND conrelid IN ('public.profiles'::regclass, 'public.user_addresses'::regclass)) AS eklenen_baglanti;
