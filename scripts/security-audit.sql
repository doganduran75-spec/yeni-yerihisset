-- YeriHisset — GÜVENLİK DENETİMİ (SALT OKUMA; hiçbir şeyi değiştirmez)
-- Çalıştırma (sunucuda):
--   docker exec -i supabase-db psql -U postgres -d postgres < /opt/yerihisset-app/scripts/security-audit.sql
-- Çıktının tamamını Claude'a gönder.

\echo '=== 1) RLS KAPALI public tablolar (hepsi açık olmalı) ==='
SELECT c.relname AS tablo
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
ORDER BY 1;

\echo '=== 2) profiles politikaları (UPDATE kolon kısıtsız + SELECT herkese açık = KRİTİK) ==='
SELECT policyname, cmd, roles::text, qual, with_check
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' ORDER BY cmd;

\echo '=== 3) profiles tetikleyicileri (role değişimini engelleyen var mı?) ==='
SELECT t.tgname, p.proname
FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid = 'public.profiles'::regclass AND NOT t.tgisinternal;

\echo '=== 4) Kullanıcının YAZABİLDİĞİ hassas tablolar (orders / order_items / user_coupons) ==='
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('orders','order_items','user_coupons','coupons')
ORDER BY tablename, cmd;

\echo '=== 5) Herkese açık okunan tablolar (qual = true) ==='
SELECT tablename, policyname, roles::text
FROM pg_policies
WHERE schemaname = 'public' AND cmd = 'SELECT' AND qual = 'true'
ORDER BY tablename;

\echo '=== 6) Storage politikaları (anon silme/yükleme = KRİTİK) ==='
SELECT policyname, cmd, roles::text, qual, with_check
FROM pg_policies WHERE schemaname = 'storage' ORDER BY cmd;

\echo '=== 7) Storage bucket ayarları (boyut / dosya türü sınırı) ==='
SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets;

\echo '=== 8) settings kolon yetkileri (gizli kolonlar anon/authenticated için KAPALI olmalı) ==='
SELECT grantee, column_name
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'settings' AND privilege_type = 'SELECT'
  AND grantee IN ('anon','authenticated')
  AND column_name ~* '(smtp_|password|secret|token)'
ORDER BY 1, 2;

\echo '=== 9) Admin sayısı (beklenmeyen admin var mı?) ==='
SELECT count(*) AS admin_sayisi FROM public.profiles WHERE role = 'admin';
SELECT email, created_at FROM public.profiles WHERE role = 'admin' ORDER BY created_at;

\echo '=== 10) SECURITY DEFINER fonksiyonlar + anon çalıştırma yetkisi ==='
SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_calistirabilir
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
ORDER BY 2 DESC, 1;
