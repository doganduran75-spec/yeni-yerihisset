-- DÜZENLENEBİLİR SAYFALAR (2026-10-11): hukuki metinler + Hakkımızda yönetim panelinden (Ayarlar › Sayfalar)
-- düzenlenir. Satır yoksa sayfa koddaki varsayılanı gösterir (src/config/static-pages.ts). Metinlerdeki
-- {{unvan}}, {{eposta}} … yer tutucuları künyeden doldurulur (src/lib/static-pages.ts).
CREATE TABLE IF NOT EXISTS public.static_pages (
  slug        text PRIMARY KEY,           -- kvkk · gizlilik · cerez-politikasi · mesafeli-satis · iade-degisim · hakkimizda
  title       text NOT NULL,
  intro       text,
  body        text NOT NULL,              -- HTML (yalnız yönetici yazar)
  draft       boolean NOT NULL DEFAULT true, -- taslak: sayfada uyarı + arama motoruna kapalı + site haritasında yok
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
ALTER TABLE public.static_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS static_pages_public_read ON public.static_pages;
CREATE POLICY static_pages_public_read ON public.static_pages FOR SELECT USING (NOT draft);
DROP POLICY IF EXISTS static_pages_admin_all ON public.static_pages;
CREATE POLICY static_pages_admin_all ON public.static_pages FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Şirket künyesi (adres / telefon / e-posta zaten var: settings.address, contact_phone, contact_email)
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS company_title text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS company_tax_office text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS company_tax_number text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS company_mersis text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS company_kep text;
-- Not: anon / authenticated'a GRANT yok — sayfalar sunucuda okur.

-- Eski sitedeki bilgilerle başlat (boşsa)
UPDATE public.settings SET
  company_title      = coalesce(nullif(company_title, ''), 'Kromozom Dış Ticaret Ltd. Şti.'),
  company_tax_office = coalesce(nullif(company_tax_office, ''), 'Kozyatağı'),
  company_tax_number = coalesce(nullif(company_tax_number, ''), '590 110 85 31'),
  address            = coalesce(nullif(address, ''), 'Barbaros Mah. Begonya Sok. No:1/2 Nida Kule Batı, Ataşehir / İstanbul');
