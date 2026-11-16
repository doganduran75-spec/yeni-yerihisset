-- site_content'te elle eklenmiş eski kural (migration dosyalarında yok; regresyon 2026-11-16 yakaladı).
-- site_content_write_service yalnız service_role'a izin veriyor — zararsız ama gereksiz (service_role RLS'e takılmaz) ve
-- "yazma yalnız yönetici" denetimini (MIG 20261191) bozuyor. Kalanlar: site_content_select_public, site_content_admin_write.
-- Tekrar çalıştırmak güvenli.

DROP POLICY IF EXISTS site_content_write_service ON public.site_content;
