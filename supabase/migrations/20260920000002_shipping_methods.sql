-- Kargo esnekliği: birden çok kargo yöntemi (Standart, Aynı Gün Kurye, Hızlı…),
-- her biri ek ücretli. Müşteri checkout'ta seçer; ücret SUNUCUDA hesaplanır.
CREATE TABLE IF NOT EXISTS public.shipping_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  fee numeric(10,2) NOT NULL DEFAULT 0,
  free_over numeric(10,2),          -- bu ürün tutarı üstü ücretsiz (null = ücretsiz yok)
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Mevcut davranışı koruyan varsayılan yöntem (500₺ üstü ücretsiz, 29.90₺)
INSERT INTO public.shipping_methods (name, description, fee, free_over, sort_order)
SELECT 'Standart Kargo', 'Anlaşmalı kargo ile 1-3 iş günü', 29.90, 500, 1
WHERE NOT EXISTS (SELECT 1 FROM public.shipping_methods);

-- Herkes aktif yöntemleri okuyabilir (katalog verisi); yazma yalnız service_role.
ALTER TABLE public.shipping_methods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shipping_methods_read ON public.shipping_methods;
CREATE POLICY shipping_methods_read ON public.shipping_methods FOR SELECT USING (true);

-- Siparişte seçilen yöntem + ücret (denetim/gösterim)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_method text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_cost numeric(10,2);
