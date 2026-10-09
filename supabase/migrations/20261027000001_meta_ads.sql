-- META (INSTAGRAM / FACEBOOK) REKLAMLARI — katalog reklamı + Pixel + Conversions API
-- * settings.meta_pixel_id            : Pixel kimliği (tarayıcı okur → anon'a açık)
-- * settings.meta_domain_verification : alan adı doğrulama kodu (<meta> etiketi → anon'a açık)
-- * settings.meta_capi_token          : Conversions API erişim anahtarı (GİZLİ — anon'a kapalı)
-- * settings.meta_test_event_code     : Events Manager "Test olayları" kodu (boşsa gerçek olay)
-- * orders.attribution : siparişin geldiği kaynak (utm_*, fbclid var mı, landing). Kart ödemesinde
--   Conversions API için geçici "meta" bilgisi (fbp/fbc/ip/tarayıcı) de burada durur; ödeme onayında
--   gönderilip SİLİNİR, ödenmeyen siparişte 2 gün sonra strip_order_ad_meta() siler.

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS meta_pixel_id text,
  ADD COLUMN IF NOT EXISTS meta_domain_verification text,
  ADD COLUMN IF NOT EXISTS meta_capi_token text,
  ADD COLUMN IF NOT EXISTS meta_test_event_code text;

-- Yalnız herkese açık olanlar (kolon bazlı yetki — 20260926000001 deseni)
GRANT SELECT (meta_pixel_id, meta_domain_verification) ON public.settings TO anon, authenticated;
REVOKE SELECT (meta_capi_token, meta_test_event_code) ON public.settings FROM anon, authenticated;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS attribution jsonb;

CREATE OR REPLACE FUNCTION public.strip_order_ad_meta()
RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH u AS (
    UPDATE public.orders SET attribution = attribution - 'meta'
     WHERE attribution ? 'meta' AND created_at < now() - interval '2 days'
    RETURNING 1
  )
  SELECT count(*)::int FROM u
$$;
REVOKE ALL ON FUNCTION public.strip_order_ad_meta() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.strip_order_ad_meta() TO service_role;
