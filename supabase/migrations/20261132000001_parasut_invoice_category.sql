-- Paraşüt: satış kanalına göre FATURA KATEGORİSİ (kullanıcı isteği 2026-10-20). Paraşüt'te faturadaki "Kategori"
-- alanı satışın yapıldığı projeyi gösteriyor (site / Trendyol / Hepsiburada / Amazon). Ayarlar › Paraşüt ›
-- Satış kanalına göre tablosunda seçilir; fatura o kanalın kategorisiyle açılır (boşsa kategorisiz).
ALTER TABLE public.parasut_channel_settings
  ADD COLUMN IF NOT EXISTS category_id   text,
  ADD COLUMN IF NOT EXISTS category_name text;
