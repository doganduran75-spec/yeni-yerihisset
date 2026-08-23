-- Sipariş durumları için 3 ayrı boyut ekleniyor
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_status  text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS shipment_status text DEFAULT 'waiting',
  ADD COLUMN IF NOT EXISTS invoice_status  text DEFAULT 'pending';

-- Mevcut siparişleri yeni kolonlara migrate et
UPDATE orders SET
  payment_status = CASE
    WHEN payment_method = 'bank_transfer' AND status IN ('awaiting_payment', 'pending') THEN 'pending'
    WHEN status IN ('paid', 'shipped', 'delivered')                                      THEN 'paid'
    WHEN status = 'cancelled'                                                            THEN 'failed'
    ELSE 'pending'
  END,
  shipment_status = CASE
    WHEN status = 'delivered' THEN 'delivered'
    WHEN status = 'shipped'   THEN 'shipped'
    WHEN status = 'paid'      THEN 'preparing'
    ELSE 'waiting'
  END,
  invoice_status = 'pending'
WHERE payment_status IS NULL OR payment_status = 'pending';
