-- İade faturası — Paraşüt (kullanıcı 2026-11-04): siparişte "İade faturasını kes (Paraşüt)".
-- Paraşüt'te "iade" türünde alış kaydı (purchase_bills, item_type refund) = Paraşüt'teki "İade Faturası".
-- Kaldığı yerden devam için kaydın no'su + ödemesi girildi mi.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS parasut_refund_id text,
  ADD COLUMN IF NOT EXISTS parasut_refund_paid boolean NOT NULL DEFAULT false;
