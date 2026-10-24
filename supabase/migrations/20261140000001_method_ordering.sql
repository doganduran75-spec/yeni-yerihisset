-- KARGO VE ÖDEME YÖNTEMİ SIRASI (kullanıcı isteği 2026-10-24): panelde oklarla sıralanır, sitede (sepet / ödeme)
-- aynı sırayla listelenir. Kargo: shipping_methods.sort_order (zaten vardı; artık varsayılan öne alınmaz, yalnız
-- seçili gelir). Ödeme: settings.payment_methods_order (ilk açık yöntem ödeme sayfasında seçili gelir).
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS payment_methods_order text[] NOT NULL DEFAULT '{credit_card,bank_transfer}';
GRANT SELECT (payment_methods_order) ON public.settings TO anon, authenticated;

-- Mevcut kargo yöntemlerinin sırası: bugünkü görünüm (varsayılan üstte) 10, 20, 30 … olarak sabitlenir
WITH r AS (
  SELECT id, row_number() OVER (ORDER BY is_default DESC, sort_order, created_at) * 10 AS n FROM public.shipping_methods
)
UPDATE public.shipping_methods m SET sort_order = r.n FROM r WHERE m.id = r.id AND m.sort_order IS DISTINCT FROM r.n;
