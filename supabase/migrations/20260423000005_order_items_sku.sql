-- Sipariş kalemlerine SKU, varyasyon ID ve varyasyon adı ekleniyor
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS variant_id   uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sku          text DEFAULT '',
  ADD COLUMN IF NOT EXISTS variant_name text DEFAULT '';
