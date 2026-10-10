-- KARGO YÖNTEMİ "VARSAYILAN" (kullanıcı notu 4, 2026-10-10): varsayılan yöntem sepette/ödemede seçili ve en üstte,
-- diğer aktif yöntemler altında. Aynı anda yalnız bir varsayılan. Sunucu kargo hesabı (src/lib/shipping.ts)
-- seçim yoksa varsayılanı kullanır. Mevcut kurulumda varsayılan, ilk aktif yöntem (sıra) olarak atanır.
ALTER TABLE public.shipping_methods ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_shipping_methods_default ON public.shipping_methods ((true)) WHERE is_default;

UPDATE public.shipping_methods SET is_default = true
 WHERE id = (SELECT id FROM public.shipping_methods WHERE is_active ORDER BY sort_order, created_at LIMIT 1)
   AND NOT EXISTS (SELECT 1 FROM public.shipping_methods WHERE is_default);

-- Tarayıcı okur (sepet / ödeme). Tablo zaten herkese açık okunuyor; yeni kolon da açık olsun.
GRANT SELECT ON public.shipping_methods TO anon, authenticated;

SELECT name, is_active, is_default, sort_order FROM public.shipping_methods ORDER BY is_default DESC, sort_order;
