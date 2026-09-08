-- Güvenlik: bir varyant (beden) silinince, o varyantı bekleyen stok bildirimi
-- kaydı DE silinmesin (eskiden ON DELETE CASCADE idi → müşteri kaybı).
-- Artık variant silinince variant_id NULL olur, kişi kaydı korunur (ürün
-- seviyesinde bildirim olarak kalır). product_id NOT NULL olduğundan CASCADE
-- kalır (ürün tümden silinirse bildirim de gitmesi kabul edilebilir).

ALTER TABLE public.stock_notifications
  DROP CONSTRAINT IF EXISTS stock_notifications_variant_id_fkey;

ALTER TABLE public.stock_notifications
  ADD CONSTRAINT stock_notifications_variant_id_fkey
  FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;
