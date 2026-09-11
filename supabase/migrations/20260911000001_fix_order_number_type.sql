-- Düzeltme: orders.order_number sunucuda integer olarak kalmış (order_number_yh
-- migration'ındaki `ADD COLUMN IF NOT EXISTS ... text` kolon zaten var olduğu için
-- atlanmıştı). set_order_number trigger'ındaki `NEW.order_number = ''` karşılaştırması
-- '' değerini integer'a çevirmeye çalışıp her sipariş INSERT'inde 22P02
-- ("invalid input syntax for type integer: \"\"") hatası veriyordu.
-- Kolonu migration'ın en baştan istediği text tipine çeviriyoruz (idempotent).

DO $$
BEGIN
  IF (
    SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_number'
  ) IN ('integer', 'bigint', 'smallint') THEN
    ALTER TABLE public.orders ALTER COLUMN order_number TYPE text USING order_number::text;
  END IF;
END $$;
