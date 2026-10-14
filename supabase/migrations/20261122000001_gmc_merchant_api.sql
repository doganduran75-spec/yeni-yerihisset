-- ============================================================
-- GOOGLE MERCHANT API (Content API'nin yerine — 18.08.2026'da kapandı) — anlık ürün gönderimi
-- ============================================================
-- Besleme (/feed/google-merchant, günlük çekim) TAM eşitlemeyi sürdürür; API değişen ürünü dakikalar içinde
-- AYNI veri kaynağına (beslemenin kaynağı) aynı kimlikle yazar → Google'da çift ürün olmaz.
-- Tetik: ürün / numara değişince gmc_sync_queue'ya girer → dakikada bir cron gönderir (src/lib/gmc-sync.ts).

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS gmc_api_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gmc_merchant_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS gmc_service_account text NOT NULL DEFAULT '',     -- servis hesabı JSON anahtarı (GİZLİ; GRANT yok)
  ADD COLUMN IF NOT EXISTS gmc_data_source text NOT NULL DEFAULT '',         -- accounts/{id}/dataSources/{id}
  ADD COLUMN IF NOT EXISTS gmc_content_language text NOT NULL DEFAULT 'tr',
  ADD COLUMN IF NOT EXISTS gmc_feed_label text NOT NULL DEFAULT 'TR';

-- Gönderilecek ürünler (ürün başına tek satır; tüm numaraları birlikte gider)
CREATE TABLE IF NOT EXISTS public.gmc_sync_queue (
  product_id      uuid PRIMARY KEY,                 -- FK yok: silinen ürün de kuyruğa girer (Google'dan silinir)
  queued_at       timestamptz NOT NULL DEFAULT now(),
  attempts        int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  error           text
);
-- Google'a gönderilmiş kalemler (silme + "değişmediyse gönderme" için)
CREATE TABLE IF NOT EXISTS public.gmc_offers (
  offer_id    text PRIMARY KEY,                     -- beslemedeki g:id ile aynı
  product_id  uuid NOT NULL,
  hash        text,
  sent_at     timestamptz,
  ok          boolean,
  error       text
);
CREATE INDEX IF NOT EXISTS idx_gmc_offers_product ON public.gmc_offers(product_id);
ALTER TABLE public.gmc_sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmc_offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gmc_queue_admin_read ON public.gmc_sync_queue;
CREATE POLICY gmc_queue_admin_read ON public.gmc_sync_queue FOR SELECT USING (public.is_admin());
DROP POLICY IF EXISTS gmc_offers_admin_read ON public.gmc_offers;
CREATE POLICY gmc_offers_admin_read ON public.gmc_offers FOR SELECT USING (public.is_admin());
REVOKE ALL ON public.gmc_sync_queue, public.gmc_offers FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.gmc_sync_queue, public.gmc_offers FROM authenticated;
GRANT SELECT ON public.gmc_sync_queue, public.gmc_offers TO authenticated;

-- Kuyruğa al (API kapalıysa hiçbir şey yapmaz)
CREATE OR REPLACE FUNCTION public.gmc_enqueue(p_product uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_product IS NULL OR NOT EXISTS (SELECT 1 FROM public.settings WHERE gmc_api_enabled) THEN RETURN; END IF;
  INSERT INTO public.gmc_sync_queue (product_id) VALUES (p_product)
  ON CONFLICT (product_id) DO UPDATE SET queued_at = now(), attempts = 0, next_attempt_at = now(), error = NULL;
END $$;
REVOKE ALL ON FUNCTION public.gmc_enqueue(uuid) FROM PUBLIC, anon, authenticated;

-- Ürün: beslemeye giden alanlardan biri değişince / silinince
CREATE OR REPLACE FUNCTION public.gmc_enqueue_product()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM public.gmc_enqueue(OLD.id); RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.title, NEW.description, NEW.short_description, NEW.slug, NEW.price, NEW.stock, NEW.images, NEW.image_url,
       NEW.is_active, NEW.has_variants, NEW.brand_id, NEW.category_id)
     IS NOT DISTINCT FROM (OLD.title, OLD.description, OLD.short_description, OLD.slug, OLD.price, OLD.stock, OLD.images, OLD.image_url,
       OLD.is_active, OLD.has_variants, OLD.brand_id, OLD.category_id) THEN
    RETURN NEW;
  END IF;
  PERFORM public.gmc_enqueue(NEW.id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.gmc_enqueue_product() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_gmc_product ON public.products;
CREATE TRIGGER trg_gmc_product AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.gmc_enqueue_product();

-- Numara: stok / fiyat / barkod / SKU / açık-kapalı
CREATE OR REPLACE FUNCTION public.gmc_enqueue_variant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM public.gmc_enqueue(OLD.product_id); RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.stock, NEW.price, NEW.compare_at_price, NEW.barcode, NEW.sku, NEW.is_active, NEW.variant_option_id)
     IS NOT DISTINCT FROM (OLD.stock, OLD.price, OLD.compare_at_price, OLD.barcode, OLD.sku, OLD.is_active, OLD.variant_option_id) THEN
    RETURN NEW;
  END IF;
  PERFORM public.gmc_enqueue(NEW.product_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.gmc_enqueue_variant() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_gmc_variant ON public.product_variants;
CREATE TRIGGER trg_gmc_variant AFTER INSERT OR UPDATE OR DELETE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.gmc_enqueue_variant();

-- "Tümünü gönder"
CREATE OR REPLACE FUNCTION public.gmc_enqueue_all()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  INSERT INTO public.gmc_sync_queue (product_id)
  SELECT id FROM public.products WHERE is_active
  UNION SELECT DISTINCT product_id FROM public.gmc_offers
  ON CONFLICT (product_id) DO UPDATE SET queued_at = now(), attempts = 0, next_attempt_at = now(), error = NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.gmc_enqueue_all() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gmc_enqueue_all() TO service_role;
