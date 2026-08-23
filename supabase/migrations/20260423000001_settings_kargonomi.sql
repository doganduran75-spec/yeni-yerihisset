-- Kargonomi entegrasyon ayarları settings tablosuna eklenir.
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS kargonomi_api_token  text DEFAULT '',
  ADD COLUMN IF NOT EXISTS kargonomi_warehouse_id text DEFAULT '';
