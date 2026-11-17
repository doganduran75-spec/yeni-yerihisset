-- Kategori ve mağaza kartlarının kapak görselleri panelden seçilir (kullanıcı 2026-11-17: "tanıtım görselindeki modelleri
-- seçebilmem iyi olur, 3'er adet seçeyim, farklı olarak gösterirsin"). Önceden kutularda stoktaki son ürünün ilk görseli
-- kendiliğinden çıkıyordu.
--   categories.cover_images  → ana sayfa "Kategoriler" kutuları (en çok 3; her ziyarette biri gösterilir)
--   settings.segment_covers  → /magaza'daki Yetişkin / 0–4 Yaş İlkadım kartları: {"yetiskin": [...], "ilkadim": [...]}
-- Boşsa eski davranış sürer (stoktaki son ürünün görseli). categories herkese açık okunur, yalnız yönetici yazar (mevcut
-- kurallar). settings.segment_covers'a anon yetkisi VERİLMEZ: sunucu yönetici istemcisiyle okur (settings-column-grants).
-- Tekrar çalıştırmak güvenli.

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS cover_images text[] NOT NULL DEFAULT '{}';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_cover_images_max3') THEN
    ALTER TABLE public.categories ADD CONSTRAINT categories_cover_images_max3 CHECK (cardinality(cover_images) <= 3);
  END IF;
END $$;

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS segment_covers jsonb NOT NULL DEFAULT '{}'::jsonb;
