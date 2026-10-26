-- Hepsiburada paketleme ("Paket hazır" → API ile paketle; kullanıcı kararı 2026-10-26): paket desisi ayarı
-- (Ayarlar › Kargo). Hepsiburada kargo ücretini buna göre hesaplar; tek koli, tüm siparişlerde aynı değer.
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS hepsiburada_desi integer NOT NULL DEFAULT 2;
DO $$ BEGIN
  ALTER TABLE public.settings ADD CONSTRAINT settings_hb_desi_chk CHECK (hepsiburada_desi BETWEEN 1 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
