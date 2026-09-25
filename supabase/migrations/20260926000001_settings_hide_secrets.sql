-- GÜVENLİK: settings tablosu "Public read" RLS politikasıyla herkese açıktı ve
-- içinde SMTP şifresi / Kargonomi API token'ı gibi GİZLİ alanlar var. Sitenin
-- JS'inde bulunan anon anahtarla herkes bunları okuyabiliyordu.
-- Çözüm: satır politikasına dokunmadan KOLON yetkisi. anon/authenticated rolleri
-- yalnız gizli OLMAYAN kolonları okuyabilir; gizli kolonları sadece sunucu
-- (service_role) okur. Admin Ayarlar sayfası artık /api/admin/settings ile okur.
-- Yazma (UPDATE/INSERT) yetkisi değişmez (RLS: yalnız admin).
--
-- NOT: İleride settings'e HERKESE AÇIK okunması gereken yeni bir kolon eklenirse
-- bu migration tekrar çalıştırılmalı (ya da o kolon için GRANT SELECT verilmeli).
-- Tekrar çalıştırmak güvenli (idempotent).
DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'settings'
    AND column_name !~* '(smtp_|password|secret|token|api_key|apikey|private|warehouse|iyzico)';

  EXECUTE 'REVOKE SELECT ON public.settings FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.settings TO anon, authenticated', cols);
END $$;
