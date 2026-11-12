-- SÖZLEŞME ONAYI KAYDI (kullanıcı 2026-11-12): ödeme sayfasındaki zorunlu kutu ("Ön Bilgilendirme Formu'nu ve
-- Mesafeli Satış Sözleşmesi'ni okudum, onaylıyorum"). Mesafeli satışta bilgilendirmenin ispatı satıcıda → her site
-- siparişine onay anı + IP + tarayıcı + o anki metnin sürümü; sürümün tam metni legal_text_versions'ta.
-- Yazan: src/lib/terms-acceptance.ts (service role). Yönetici siparişinde ve aktarılan / pazaryeri siparişinde boş kalır.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version     text,   -- legal_text_versions.hash
  ADD COLUMN IF NOT EXISTS terms_ip          text,
  ADD COLUMN IF NOT EXISTS terms_user_agent  text;

-- Onaylanan metnin sürümleri (sha256 özeti → o anki tam metin; metin değişmedikçe yeni satır eklenmez)
CREATE TABLE IF NOT EXISTS public.legal_text_versions (
  hash            text PRIMARY KEY,
  slug            text NOT NULL,
  title           text NOT NULL,
  body            text NOT NULL,
  page_updated_at timestamptz,          -- panelde sayfanın son düzenlenme anı (varsayılan metinde boş)
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.legal_text_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS legal_text_versions_admin_read ON public.legal_text_versions;
CREATE POLICY legal_text_versions_admin_read ON public.legal_text_versions FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.legal_text_versions FROM anon;
