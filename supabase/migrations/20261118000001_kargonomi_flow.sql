-- ============================================================
-- KARGONOMİ AKIŞI: teklif → firma seçimi → kod bekleme
-- ============================================================
-- "Kargoya ver (Kargonomi)": taslak gönderi + firma teklifleri (kargonomi_offers) → yönetici firmayı
-- seçer (confirm-shipping-price) → kargo kodu gelene kadar dakikada bir sorgulanır
-- (src/lib/kargonomi-flow.ts, /api/cron/marketplace-sync) → kod gelince sipariş "Kargoda",
-- müşteriye takip numaralı e-posta. Kod gelmeden sipariş kargolanmış sayılmaz.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS kargonomi_status text,              -- Kargonomi gönderi durumu (draft, ready, webservice_…)
  ADD COLUMN IF NOT EXISTS kargonomi_provider text,            -- seçilen kargo firması
  ADD COLUMN IF NOT EXISTS kargonomi_offers jsonb,             -- son alınan teklifler [{id, name, price, amount}]
  ADD COLUMN IF NOT EXISTS kargonomi_desi numeric(8,2),
  ADD COLUMN IF NOT EXISTS kargonomi_confirmed_at timestamptz, -- firma seçildi → kod bekleniyor
  ADD COLUMN IF NOT EXISTS kargonomi_checked_at timestamptz,   -- son sorgu
  ADD COLUMN IF NOT EXISTS kargonomi_error text;               -- firma gönderiyi oluşturamadı vb.

CREATE INDEX IF NOT EXISTS idx_orders_kargonomi_waiting ON public.orders(kargonomi_confirmed_at)
  WHERE kargonomi_shipment_id IS NOT NULL AND kargonomi_tracking_code IS NULL;
