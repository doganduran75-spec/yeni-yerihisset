-- FAZ 5 — RLS sadeleştirme (davranış değişmez; idempotent)

-- 1) Aynı işi yapan çift admin politikaları → tek
DROP POLICY IF EXISTS "Admins manage email_templates"   ON public.email_templates;   -- kalan: "Admins can manage email templates"
DROP POLICY IF EXISTS "Admins read notification_log"    ON public.notification_log;  -- kalan: "Admins can view notification logs"
DROP POLICY IF EXISTS "Admin All Settings"              ON public.settings;          -- kalan: "Admins manage settings"

-- 2) Üye etiketleri (CRM segmentleri) herkese açık okunmasın — yalnız admin.
--    (Etiketleri siparişte sunucu yazar; tarayıcıda yalnız admin sayfaları okur.)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['member_tag_groups', 'member_tag_options'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_admin())', t || '_admin_read', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS "Herkes tag gruplarını görebilir"    ON public.member_tag_groups;
DROP POLICY IF EXISTS "Herkes tag seçeneklerini görebilir" ON public.member_tag_options;

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('email_templates', 'notification_log', 'settings', 'member_tag_groups', 'member_tag_options')
ORDER BY tablename, policyname;
