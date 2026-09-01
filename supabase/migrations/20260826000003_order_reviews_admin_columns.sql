-- Admin "Yorumlar" sayfası order_reviews üzerinde admin_note (reddetme notu)
-- ve updated_at kolonlarını kullanıyor (SELECT + onayla/reddet UPDATE'lerinde),
-- ancak bu kolonlar tabloda hiç oluşturulmamıştı. Bu yüzden admin sorgusu
-- "column order_reviews.admin_note does not exist" (42703) hatası veriyor,
-- bekleyen yorumlar admin panelinde görünmüyordu.
ALTER TABLE public.order_reviews
  ADD COLUMN IF NOT EXISTS admin_note text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
