-- BASİT KARGO (kullanıcı 2026-11-03: Kargonomi API vermiyor → alternatif). Belge: https://basitkargo.com/api
-- Akış Kargonomi ile aynı (src/lib/kargonomi-flow.ts): sipariş (NEW) → firma fiyatları → seçilen firmayla barkod.
-- Siparişteki kargonomi_* alanları "kargo entegrasyonu" alanları olarak ortak kullanılır; hangi sağlayıcı olduğu
-- orders.kargo_api'de (NULL = kargonomi, eski). Ayarlarda Basit Kargo açıksa yeni gönderiler Basit Kargo'dan.
-- Token tarayıcıya dönmez (yönetim /api/admin/basitkargo). Yeni settings kolonları anon/authenticated'a kapalı
-- (20260926: tablo düzeyinde SELECT yok, GRANT verilmedi).
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS basitkargo_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS basitkargo_api_token text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS basitkargo_address_id text;   -- gönderici adresi (Basit Kargo panelindeki)
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS basitkargo_webhook_key text;  -- webhook adresindeki gizli anahtar

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS kargo_api text;
DO $$ BEGIN
  ALTER TABLE public.orders ADD CONSTRAINT orders_kargo_api_check CHECK (kargo_api IS NULL OR kargo_api IN ('kargonomi', 'basitkargo'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
