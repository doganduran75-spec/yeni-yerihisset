-- ─── iyzico Entegrasyonu ─────────────────────────────────────────────────────

-- Müşteri profili: TC Kimlik No (iyzico zorunlu)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS identity_number text;

-- Sipariş: iyzico ödeme referansları + iade bilgisi
ALTER TABLE orders ADD COLUMN IF NOT EXISTS iyzico_payment_id      text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS iyzico_conversation_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS iyzico_token           text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_status          text; -- null | partial | full
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_amount        numeric(10,2) DEFAULT 0;
