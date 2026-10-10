-- MOBİL KARŞILAMA VİDEOSU (kullanıcı notu 10, 2026-10-10): mobil ana sayfaya ilk girişte bir kez,
-- sayfa önce gelir; video arka planda yüklenip hazır olunca tam ekran oynar, bitince sayfaya döner.
-- Ayarlar › Genel › Mobil karşılama videosu. Varsayılan geçici video: /intro/intro.mp4 (public/intro).
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS intro_video_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS intro_video_url text DEFAULT '/intro/intro.mp4';
GRANT SELECT (intro_video_enabled, intro_video_url) ON public.settings TO anon, authenticated;
SELECT intro_video_enabled, intro_video_url FROM public.settings LIMIT 1;
