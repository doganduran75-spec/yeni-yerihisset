-- Faz 2: YeriHisset Kredisi'nin sepette harcanması.
-- Siparişte kullanılan kredi tutarı + iadede geri yükleme guard'ı.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS credit_used numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS credit_restored boolean NOT NULL DEFAULT false;
