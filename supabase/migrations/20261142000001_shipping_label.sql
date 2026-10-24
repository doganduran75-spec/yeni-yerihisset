-- ORTAK KARGO ETİKETİ (site + Trendyol + Hepsiburada; kullanıcı kararları 2026-10-24):
--   * Etiket her yazdırmada siparişin GÜNCEL kargo kodundan yeniden üretilir; yazdırılan kod saklanır.
--     Kod sonradan değişirse (kargo firması değişti, gönderi yeniden açıldı) panel "Kargo kodu değişti —
--     etiketi yeniden yazdır" der. Kargo kodu olmayan siparişe etiket basılmaz.
--   * Kâğıt boyutu ayarı: şimdilik A5, ileride 10×15 etiket yazıcısı.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS label_printed_code text,
  ADD COLUMN IF NOT EXISTS label_printed_at   timestamptz;

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS label_size text NOT NULL DEFAULT 'a5';
DO $$ BEGIN
  ALTER TABLE public.settings ADD CONSTRAINT settings_label_size_chk CHECK (label_size IN ('a5', '100x150'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
