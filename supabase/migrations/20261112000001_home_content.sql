-- Ana sayfa metinleri panelden (Ayarlar › Ana Sayfa, 2026-10-12): yalnız değiştirilenler burada; geri kalanı
-- koddaki varsayılan (src/config/homeContent.ts). NULL = tamamen varsayılan. Sunucu okur (GRANT yok).
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS home_content jsonb;
