-- Kargonomi entegrasyonu için orders tablosuna tracking alanları eklenir.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS kargonomi_shipment_id text,
  ADD COLUMN IF NOT EXISTS kargonomi_tracking_code text;
