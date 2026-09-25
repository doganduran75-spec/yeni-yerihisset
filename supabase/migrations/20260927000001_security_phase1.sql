-- ════════════════════════════════════════════════════════════════════════════
-- GÜVENLİK FAZ 1 (2026-09-27) — denetimde (scripts/security-audit.sql) çıkan
-- KRİTİK / YÜKSEK açıklar. Tekrar çalıştırmak güvenli (idempotent).
-- Sunucu (service_role) hiçbir değişiklikten etkilenmez; yalnız tarayıcıdan
-- (anon / authenticated) doğrudan veritabanı erişimi daraltılır.
-- ════════════════════════════════════════════════════════════════════════════

-- ── K1: Üye kendi rolünü 'admin' yapamasın (yetki yükseltme) ────────────────
-- Tarayıcı yalnız şu kolonları güncelleyebilir: ad, soyad, telefon, son görülme.
-- role / email / email_verified / deleted_at / credit … yalnız sunucu (service_role).
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ') INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles'
    AND column_name IN ('first_name', 'last_name', 'phone', 'last_active_at');
  EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', cols);
END $$;

DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
CREATE POLICY "Users can update own profile." ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Profil satırını sunucu/tetikleyici oluşturur; tarayıcıdan INSERT gereksiz
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;

-- ── K2: Profiller herkese açık olmasın (e-posta, telefon, TCKN sızıntısı) ────
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS profiles_select_own_or_admin ON public.profiles;
CREATE POLICY profiles_select_own_or_admin ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

-- Ürün yorumlarında yorum yapanın adı (herkese açık) → yalnız "Ad S." biçimi,
-- yalnız ONAYLI yorumu olan kullanıcılar için. Profil tablosunu açmadan.
CREATE OR REPLACE FUNCTION public.review_author_names(p_user_ids uuid[])
RETURNS TABLE (user_id uuid, display_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id,
         trim(coalesce(p.first_name, '') || ' ' ||
              CASE WHEN coalesce(p.last_name, '') <> '' THEN left(p.last_name, 1) || '.' ELSE '' END)
  FROM public.profiles p
  WHERE p.id = ANY(p_user_ids)
    AND EXISTS (SELECT 1 FROM public.order_reviews r WHERE r.user_id = p.id AND r.is_approved = true);
$$;
REVOKE ALL ON FUNCTION public.review_author_names(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_author_names(uuid[]) TO anon, authenticated, service_role;

-- ── Y1: Sipariş / sipariş kalemi tarayıcıdan YAZILAMASIN (sahte "ödendi" sipariş)
-- Siparişleri yalnız sunucu API'leri oluşturur (fiyat/stok doğrulamalı).
DROP POLICY IF EXISTS "Users can create their own orders." ON public.orders;
DROP POLICY IF EXISTS "Users can create order items for their own orders." ON public.order_items;

-- ── Y2: Üye kendine kupon TANIMLAYAMASIN / kullanım sayacını sıfırlayamasın ──
DROP POLICY IF EXISTS "Users insert own coupons" ON public.user_coupons;
DROP POLICY IF EXISTS "Users update own coupons" ON public.user_coupons;

-- ── RLS'i KAPALI tablolar (herkes okuyup YAZABİLİYORDU) → yalnız admin ───────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['affiliate_payout_runs','marketplace_channels','stock_sync_tasks','store_credit_ledger'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_all', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())', t || '_admin_all', t);
    END IF;
  END LOOP;
  -- Kredi hareketleri: kişi kendi hareketlerini görebilsin (kolon varsa)
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='store_credit_ledger' AND column_name='user_id') THEN
    EXECUTE 'DROP POLICY IF EXISTS store_credit_ledger_own_select ON public.store_credit_ledger';
    EXECUTE 'CREATE POLICY store_credit_ledger_own_select ON public.store_credit_ledger FOR SELECT USING (user_id = auth.uid())';
  END IF;
END $$;

-- ── Tarayıcıdan çağrılmaması gereken SECURITY DEFINER fonksiyonlar ──────────
-- (tetikleyici / cron / sunucu çağırır; anon çağırabiliyordu)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('link_contacts_for_user','prune_analytics','rollup_analytics_daily')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
  -- Admin fonksiyonları içeride is_admin() kontrol ediyor; anon'a yine de gerek yok
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('admin_link_contact_to_member','admin_merge_duplicate_contacts','analytics_storage')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;

-- ── Örnek (seed) admin hesapları: admin yetkisi kaldırılır ──────────────────
UPDATE public.profiles SET role = 'customer'
WHERE role = 'admin' AND email IN ('ahmet@example.com', 'ayse@example.com');

-- ── Depolama: görsel yükleme izinleri + boyut/tür sınırı ────────────────────
-- Admin: product-images ve site kovalarında her şey. Müşteri: yalnız kendi
-- yorum klasörüne (reviews/<kendi id>/...) yükleme. Anonim: hiçbir yazma yok.
-- Herkese açık görüntüleme public URL ile zaten çalışır (RLS gerekmez).
INSERT INTO storage.buckets (id, name, public)
VALUES ('site', 'site', true)
ON CONFLICT (id) DO NOTHING;

UPDATE storage.buckets
SET file_size_limit = 10485760,  -- 10 MB
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/avif','image/gif']
WHERE id IN ('product-images', 'site');

-- Eski buluttan gelebilecek "herkes silebilir/yükleyebilir" politikaları
DROP POLICY IF EXISTS "Authenticated Delete" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Update" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;

DROP POLICY IF EXISTS yh_storage_admin_all ON storage.objects;
CREATE POLICY yh_storage_admin_all ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id IN ('product-images','site') AND public.is_admin())
  WITH CHECK (bucket_id IN ('product-images','site') AND public.is_admin());

DROP POLICY IF EXISTS yh_storage_review_own ON storage.objects;
CREATE POLICY yh_storage_review_own ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'product-images'
         AND (storage.foldername(name))[1] = 'reviews'
         AND (storage.foldername(name))[2] = auth.uid()::text)
  WITH CHECK (bucket_id = 'product-images'
         AND (storage.foldername(name))[1] = 'reviews'
         AND (storage.foldername(name))[2] = auth.uid()::text);

-- ── Kontrol çıktısı ────────────────────────────────────────────────────────
SELECT 'profiles politikaları' AS kontrol, string_agg(policyname || ' [' || cmd || ']', ', ') AS sonuc
  FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
UNION ALL
SELECT 'RLS kapalı tablo sayısı', count(*)::text
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
UNION ALL
SELECT 'admin hesapları', string_agg(email, ', ') FROM public.profiles WHERE role='admin'
UNION ALL
SELECT 'storage politikaları', string_agg(policyname, ', ') FROM pg_policies WHERE schemaname='storage';
