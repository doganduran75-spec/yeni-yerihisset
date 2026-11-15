-- FIRSATLAR + BİLGİ BANKASI AÇ / KAPA (kullanıcı 2026-11-15, canlıya geçiş): içerikleri hazır olana kadar menülerde
-- (üst menü, alt sekme çubuğu, site altı, satış ortağı bağlantıları) görünmesinler. Kapalıyken sayfalar doğrudan
-- adresle açılır (yönetici üzerinde çalışabilsin, eski yazı yönlendirmeleri boşa düşmesin) ama Google'a kapalıdır
-- (noindex + site haritasında yok). Açmak: Fırsatlar ekranı / Bilgi Bankası ekranındaki "… sitede açık" kutusu.
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS opportunities_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS kb_enabled boolean NOT NULL DEFAULT false;
-- Menü kararı ziyaretçinin tarayıcısında verilir → herkese okunur (settings kolon yetkileri kuralı)
GRANT SELECT (opportunities_enabled, kb_enabled) ON public.settings TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
