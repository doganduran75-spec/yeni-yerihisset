-- Sipariş anındaki FATURA bilgilerini (teslimat adresinden farklı olabilir)
-- siparişe snapshot olarak sakla. shipping_address gibi JSON metin tutulur:
-- { same_as_shipping, name, phone, address, district, city, identity_number }
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS billing_address text;
