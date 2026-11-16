-- Kategori sırası (kullanıcı 2026-11-16): mağazadaki kategori düğmeleri ve "Hepsi" listesindeki ürünler bu sırayla
-- (mevsime göre panelden değişir: kışın Bot › Ayakkabı › Babet › Aksesuar). Küçük sayı önce; eşitse ada göre.
-- categories herkese okunur (tablo politikası), kolon izni gerekmez.

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100;

-- İlk sıra: kış
UPDATE public.categories SET sort_order = CASE
    WHEN name ILIKE 'bot%' THEN 10
    WHEN name ILIKE 'ayakkab%' THEN 20
    WHEN name ILIKE 'babet%' THEN 30
    WHEN name ILIKE 'aksesuar%' THEN 40
    ELSE 100 END
  WHERE sort_order = 100;
