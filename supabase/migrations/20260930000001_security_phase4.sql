-- GÜVENLİK FAZ 4 — küçük RLS temizlikleri (idempotent)

-- 1) notification_log: giriş yapmış HER üye kayıt ekleyebiliyordu (log kirletme).
--    Kayıtları yalnız sunucu (service_role) yazar; admin okur.
DROP POLICY IF EXISTS "Insert notification_log" ON public.notification_log;

-- 2) email_templates: herkese açık okuma gereksiz (tarayıcıda yalnız admin okur;
--    e-postaları sunucu gönderir). Admin politikası yerinde kalır.
DROP POLICY IF EXISTS "Public read active email_templates" ON public.email_templates;

-- 3) settings: aynı işi yapan çift "herkese açık okuma" politikası → tek.
--    (Gizli kolonlar zaten kolon yetkisiyle kapalı — 20260926000001.)
DROP POLICY IF EXISTS "Public Read Settings" ON public.settings;

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('notification_log', 'email_templates', 'settings')
ORDER BY tablename, policyname;
