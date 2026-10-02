-- ============================================================
-- Eski site (WooCommerce) SAHTE ÜYE temizliği: "bir daha aktarma" listesi
-- ============================================================
-- Admin › Üyeler › "Eski site üyelerini incele" ekranında silinen hesapların e-postası
-- buraya yazılır; scripts/woo-import.mjs (geçiş günü son aktarım) bu e-postaları atlar
-- (o kişi eski sitede SİPARİŞ verdiyse yine aktarılır — gerçek müşteridir).

CREATE TABLE IF NOT EXISTS public.legacy_import_blocklist (
  email       text PRIMARY KEY,                -- küçük harf
  reason      text,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.legacy_import_blocklist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS legacy_import_blocklist_admin ON public.legacy_import_blocklist;
CREATE POLICY legacy_import_blocklist_admin ON public.legacy_import_blocklist FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

SELECT 'legacy_import_blocklist hazır' AS durum;
