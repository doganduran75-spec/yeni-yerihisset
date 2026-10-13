-- ============================================================
-- PARAŞÜT (ön muhasebe) ENTEGRASYONU — 1. adım: bağlantı, kanal ayarları, kargo VKN, ürün eşleştirme
-- ============================================================
-- Kullanıcı kararları (2026-10-13): faturayı siparişte düğmeyle (şimdilik elle) keser; pazaryerine göre
-- farklı ayar (Trendyol siparişi "tahsil edildi" + kasa "Trendyol", site siparişi kendi kasası); her numara
-- Paraşüt'te ayrı ürün → barkod ya da SKU ile eşleşir; iade faturası şimdilik Paraşüt'te elle.
-- Kod: src/lib/parasut.ts (API), /api/admin/parasut, Ayarlar › Entegrasyonlar › Paraşüt.

-- Uygulama bilgileri (destek@parasut.com verir). Gizli kolonlar anon/authenticated'a GRANT edilmez
-- (20260926000001 kolon bazlı izin) → yalnız sunucu + /api/admin/settings.
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS parasut_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parasut_client_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS parasut_client_secret text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS parasut_company_id text NOT NULL DEFAULT '',          -- firma no (URL'deki sayı)
  ADD COLUMN IF NOT EXISTS parasut_shipment_included boolean NOT NULL DEFAULT true; -- irsaliyeli fatura (Paraşüt stoğu düşer)

-- Oturum (access 2 saat; refresh_token her yenilemede değişir). Tarayıcıya hiç açılmaz.
CREATE TABLE IF NOT EXISTS public.parasut_auth (
  id            int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  connected_at  timestamptz,
  user_email    text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.parasut_auth ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.parasut_auth FROM anon, authenticated;

-- Satış kanalına göre fatura ayarı: tahsilat hesabı (kasa/banka), tahsil edildi işaretlensin mi,
-- e-Arşiv "internet satışı" bilgileri (ödeme tipi / platform / adres)
CREATE TABLE IF NOT EXISTS public.parasut_channel_settings (
  channel          text PRIMARY KEY,               -- site | trendyol | hepsiburada | amazon
  account_id       text,                           -- Paraşüt hesap id
  account_name     text,
  mark_paid        boolean NOT NULL DEFAULT true,
  payment_type     text,                           -- KREDIKARTI/BANKAKARTI | EFT/HAVALE | KAPIDAODEME | ODEMEARACISI (site: ödeme yönteminden)
  payment_platform text,                           -- iyzico, Trendyol …
  internet_url     text,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.parasut_channel_settings (channel, payment_type, payment_platform, internet_url) VALUES
  ('site', NULL, 'iyzico', 'https://yerihisset.com'),
  ('trendyol', 'ODEMEARACISI', 'Trendyol', 'https://www.trendyol.com'),
  ('hepsiburada', 'ODEMEARACISI', 'Hepsiburada', 'https://www.hepsiburada.com'),
  ('amazon', 'ODEMEARACISI', 'Amazon', 'https://www.amazon.com.tr')
ON CONFLICT (channel) DO NOTHING;
ALTER TABLE public.parasut_channel_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parasut_channel_admin ON public.parasut_channel_settings;
CREATE POLICY parasut_channel_admin ON public.parasut_channel_settings FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE ALL ON public.parasut_channel_settings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parasut_channel_settings TO authenticated;

-- Kargo firmaları: e-Arşiv'de internet satışında firma adı + VKN zorunlu. Ad, siparişteki kargo
-- firmasıyla (Kargonomi / pazaryeri) eşleşir; VKN'yi kullanıcı bir kez girer.
CREATE TABLE IF NOT EXISTS public.cargo_carriers (
  name       text PRIMARY KEY,
  vkn        text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.cargo_carriers (name) VALUES
  ('Aras Kargo'), ('Yurtiçi Kargo'), ('MNG Kargo'), ('Sürat Kargo'), ('PTT Kargo'),
  ('Hepsijet'), ('Kolay Gelsin'), ('Trendyol Express'), ('UPS Kargo'), ('DHL eCommerce')
ON CONFLICT (name) DO NOTHING;
ALTER TABLE public.cargo_carriers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cargo_carriers_admin ON public.cargo_carriers;
CREATE POLICY cargo_carriers_admin ON public.cargo_carriers FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE ALL ON public.cargo_carriers FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cargo_carriers TO authenticated;

-- Paraşüt ürün listesi (eşleştirme için son çekilen kopya)
CREATE TABLE IF NOT EXISTS public.parasut_products (
  parasut_id  text PRIMARY KEY,
  code        text,
  barcode     text,
  name        text,
  vat_rate    numeric(5,2),
  stock_count numeric(12,2),
  archived    boolean NOT NULL DEFAULT false,
  synced_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_parasut_products_code ON public.parasut_products (upper(btrim(code)));
CREATE INDEX IF NOT EXISTS idx_parasut_products_barcode ON public.parasut_products (upper(btrim(barcode)));
ALTER TABLE public.parasut_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parasut_products_admin_read ON public.parasut_products;
CREATE POLICY parasut_products_admin_read ON public.parasut_products FOR SELECT USING (public.is_admin());
REVOKE ALL ON public.parasut_products FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.parasut_products FROM authenticated;
GRANT SELECT ON public.parasut_products TO authenticated;

-- Eşleşme (her numara = bir Paraşüt ürünü; varyantsız üründe ürünün kendisi)
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS parasut_product_id text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS parasut_product_id text;

-- Sipariş faturası (2. adım: siparişte "Faturayı kes (Paraşüt)")
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS parasut_invoice_id text,
  ADD COLUMN IF NOT EXISTS parasut_status text,        -- creating | job_pending | pdf_pending | done | error
  ADD COLUMN IF NOT EXISTS parasut_error text,
  ADD COLUMN IF NOT EXISTS parasut_job_id text,
  ADD COLUMN IF NOT EXISTS parasut_e_doc_type text,    -- e_archive | e_invoice
  ADD COLUMN IF NOT EXISTS parasut_e_doc_id text,
  ADD COLUMN IF NOT EXISTS parasut_invoice_no text,
  ADD COLUMN IF NOT EXISTS parasut_pdf_path text,
  ADD COLUMN IF NOT EXISTS parasut_invoiced_at timestamptz;
