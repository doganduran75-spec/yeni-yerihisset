-- Fikir B (temel): üyenin son ziyaret/aktiflik tarihi. CRM otomasyonu sonra
-- bağlanır; şimdilik yalnız takip + admin gösterimi.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_active_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_profiles_last_active ON public.profiles (last_active_at DESC);
