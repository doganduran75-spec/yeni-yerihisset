-- Ödeme yöntemi ayarları settings tablosuna eklenir
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS bank_transfer_enabled  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS bank_transfer_info     text    DEFAULT '';

-- Siparişlerde ödeme yöntemi ve "havale bekleniyor" durumu
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'credit_card';

-- Havale/EFT ile gelen siparişlerde yeni durum
-- Mevcut: pending | paid | shipped | delivered | cancelled
-- Eklenen: awaiting_payment (ödeme bekleniyor)
-- NOT: Uygulama katmanında yönetilir, DB kısıtı eklenmedi.
