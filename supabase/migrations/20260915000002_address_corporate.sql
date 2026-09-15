-- Kurumsal fatura alanları: adres kaydı bireysel veya kurumsal olabilir.
-- Kurumsal ise şirket ünvanı + vergi dairesi + vergi numarası (VKN) tutulur.
ALTER TABLE public.user_addresses ADD COLUMN IF NOT EXISTS is_corporate boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_addresses ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE public.user_addresses ADD COLUMN IF NOT EXISTS tax_office text;
ALTER TABLE public.user_addresses ADD COLUMN IF NOT EXISTS tax_number text;
