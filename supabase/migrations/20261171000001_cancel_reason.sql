-- İptal nedeni (kullanıcı 2026-11-06): iptal e-postasında müşteri neden iptal edildiğini görsün.
-- Yönetici iptalde nedeni seçer (zorunlu) + isteğe bağlı müşteriye not (e-postada aynen görünür).
-- Değerler: stock (stokta kalmadı) · customer (müşteri istedi) · payment (ödeme gelmedi) · address (adres / teslimat) · other
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS cancel_customer_note text;
