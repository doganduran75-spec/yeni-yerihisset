-- ============================================================
-- PARAŞÜT 2. adım: siparişte "Faturayı kes (Paraşüt)"
-- ============================================================
-- src/lib/parasut-invoice.ts: müşteri → satış faturası (KDV Paraşüt ürün kaydından; site fiyatları KDV dahil →
-- KDV hariç birim fiyat fatura anında hesaplanır; kupon + kredi ürün fiyatından düşer, kargoya dokunulmaz)
-- → tahsilat (kanal hesabı) → e-Fatura / e-Arşiv → iş takibi (cron) → PDF (özel depo) → "Faturalandı".

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS parasut_shipping_product_id text NOT NULL DEFAULT '';  -- kargo ücreti kalemi (Paraşüt'te "Kargo" hizmeti, %20)

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS parasut_paid boolean NOT NULL DEFAULT false,    -- tahsilat Paraşüt'e işlendi
  ADD COLUMN IF NOT EXISTS parasut_diff_ok boolean NOT NULL DEFAULT false; -- tutar farkı yönetici onaylı

-- Fatura PDF'leri: herkese kapalı depo (yalnız sunucu; yöneticiye süreli bağlantı)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('invoices', 'invoices', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;
