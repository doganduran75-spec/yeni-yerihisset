-- Pazaryeri stok senkronu v2.1: HEPSIBURADA kanalı + SENKRON GEÇMİŞİ (log).
-- Önkoşul: 20261003000001_marketplace_stock_sync. Tekrar çalıştırmak güvenli.
--
-- Kanal başına "ilan anahtarı" (kuyruktaki barcode kolonu = kanala gönderilen kimlik):
--   trendyol    → varyant BARKODU
--   hepsiburada → ayara göre varyant BARKODU ya da SKU'su (= Hepsiburada'daki MerchantSku)

-- 1) Hepsiburada ayarları (anon/authenticated'a kapalı kalır)
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS hepsiburada_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hepsiburada_merchant_id text,
  ADD COLUMN IF NOT EXISTS hepsiburada_service_key text,
  ADD COLUMN IF NOT EXISTS hepsiburada_username text,              -- User-Agent (entegratör kullanıcı adı)
  ADD COLUMN IF NOT EXISTS hepsiburada_match_field text NOT NULL DEFAULT 'barcode', -- 'barcode' | 'sku'
  ADD COLUMN IF NOT EXISTS hepsiburada_stage boolean NOT NULL DEFAULT false;

-- 2) Paket içi sıra (Hepsiburada hataları sıra numarasıyla döner)
ALTER TABLE public.marketplace_stock_sync ADD COLUMN IF NOT EXISTS batch_pos int;

-- 3) Senkron geçmişi — her KESİNLEŞMİŞ sonuç bir satır (başarılı / hatalı)
CREATE TABLE IF NOT EXISTS public.marketplace_stock_log (
  id bigserial PRIMARY KEY,
  channel text NOT NULL,
  variant_id uuid,
  product_id uuid,
  listing_key text NOT NULL,     -- gönderilen barkod / SKU
  qty int NOT NULL,
  ok boolean NOT NULL,
  message text,
  batch_request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msl_created ON public.marketplace_stock_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msl_channel_created ON public.marketplace_stock_log(channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msl_key ON public.marketplace_stock_log(listing_key);
ALTER TABLE public.marketplace_stock_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_stock_log FROM anon, authenticated;
GRANT ALL ON public.marketplace_stock_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.marketplace_stock_log_id_seq TO service_role;

-- 4) Kanal için ilan anahtarı
CREATE OR REPLACE FUNCTION public.marketplace_listing_key(p_channel text, p_barcode text, p_sku text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULLIF(btrim(CASE
    WHEN p_channel = 'hepsiburada'
     AND COALESCE((SELECT hepsiburada_match_field FROM public.settings ORDER BY id LIMIT 1), 'barcode') = 'sku'
      THEN p_sku
    ELSE p_barcode
  END), '');
$$;

-- Kanal için gönderilecek stok (Trendyol en çok 20.000 kabul eder)
CREATE OR REPLACE FUNCTION public.marketplace_qty(p_channel text, p_stock int)
RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_channel = 'trendyol'
    THEN GREATEST(0, LEAST(COALESCE(p_stock, 0), 20000))
    ELSE GREATEST(0, COALESCE(p_stock, 0)) END;
$$;

-- 5) Tetikleyici: her kanal için kuyruğa yaz (kanal kapalıysa satır bekler, açılınca gider)
CREATE OR REPLACE FUNCTION public.enqueue_marketplace_stock()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ch text;
  k text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.stock IS NOT DISTINCT FROM OLD.stock
     AND NEW.barcode IS NOT DISTINCT FROM OLD.barcode
     AND NEW.sku IS NOT DISTINCT FROM OLD.sku THEN
    RETURN NEW;
  END IF;

  FOREACH ch IN ARRAY ARRAY['trendyol', 'hepsiburada'] LOOP
    k := public.marketplace_listing_key(ch, NEW.barcode, NEW.sku);
    CONTINUE WHEN k IS NULL;
    INSERT INTO public.marketplace_stock_sync
      (channel, variant_id, product_id, barcode, desired_qty, status, attempts, next_attempt_at, error, updated_at)
    VALUES
      (ch, NEW.id, NEW.product_id, k, public.marketplace_qty(ch, NEW.stock), 'pending', 0, now(), NULL, now())
    ON CONFLICT (channel, variant_id) DO UPDATE SET
      barcode = EXCLUDED.barcode,
      product_id = EXCLUDED.product_id,
      desired_qty = EXCLUDED.desired_qty,
      status = CASE WHEN public.marketplace_stock_sync.status = 'sending' THEN 'sending' ELSE 'pending' END,
      attempts = 0,
      next_attempt_at = now(),
      error = NULL,
      updated_at = now();
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketplace_stock ON public.product_variants;
CREATE TRIGGER trg_marketplace_stock
  AFTER INSERT OR UPDATE OF stock, barcode, sku ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_marketplace_stock();

-- 6) Tümünü kuyruğa al (kanala göre anahtar)
CREATE OR REPLACE FUNCTION public.enqueue_all_marketplace_stock(p_channel text)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  INSERT INTO public.marketplace_stock_sync
    (channel, variant_id, product_id, barcode, desired_qty, status, attempts, next_attempt_at, error, updated_at)
  SELECT p_channel, v.id, v.product_id, k.key, public.marketplace_qty(p_channel, v.stock),
         'pending', 0, now(), NULL, now()
    FROM public.product_variants v
    CROSS JOIN LATERAL (SELECT public.marketplace_listing_key(p_channel, v.barcode, v.sku) AS key) k
   WHERE k.key IS NOT NULL
  ON CONFLICT (channel, variant_id) DO UPDATE SET
    barcode = EXCLUDED.barcode,
    desired_qty = EXCLUDED.desired_qty,
    status = CASE WHEN public.marketplace_stock_sync.status = 'sending' THEN 'sending' ELSE 'pending' END,
    attempts = 0, next_attempt_at = now(), error = NULL, updated_at = now();
  GET DIAGNOSTICS n = ROW_COUNT;
  -- Anahtarı artık olmayan (ör. eşleştirme alanı değişti, SKU boş) satırları temizle
  DELETE FROM public.marketplace_stock_sync s
   USING public.product_variants v
   WHERE s.channel = p_channel AND s.variant_id = v.id
     AND public.marketplace_listing_key(p_channel, v.barcode, v.sku) IS NULL
     AND s.status <> 'sending';
  RETURN n;
END;
$$;

-- 7) Gönderim kabul edildi — paket içi sıra ile (p_pos[i] ↔ p_ids[i])
CREATE OR REPLACE FUNCTION public.mark_marketplace_stock_sent(p_ids uuid[], p_batch text, p_pos int[])
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.marketplace_stock_sync s
     SET last_sent_qty = s.sending_qty,
         batch_request_id = p_batch,
         batch_pos = p_pos[array_position(p_ids, s.id)],
         sent_at = now(),
         error = NULL,
         attempts = 0,
         status = CASE WHEN s.desired_qty = s.sending_qty THEN 'sent' ELSE 'pending' END,
         next_attempt_at = now(),
         updated_at = now()
   WHERE s.id = ANY(p_ids) AND s.status = 'sending';
$$;

REVOKE ALL ON FUNCTION public.mark_marketplace_stock_sent(uuid[], text, int[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_all_marketplace_stock(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketplace_listing_key(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_marketplace_stock_sent(uuid[], text, int[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_all_marketplace_stock(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketplace_listing_key(text, text, text) TO service_role;

-- 8) "Sitede son stok değişikliği" için damga: stok hangi yoldan değişirse değişsin
--    (ürün formu, sipariş, iptal, toplu içe aktarma) stock_changed_at = now().
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS stock_changed_at timestamptz;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_changed_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_pv_stock_changed ON public.product_variants(stock_changed_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_p_stock_changed ON public.products(stock_changed_at DESC NULLS LAST);

CREATE OR REPLACE FUNCTION public.touch_stock_changed_at()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.stock IS DISTINCT FROM OLD.stock THEN
    NEW.stock_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pv_stock_changed_at ON public.product_variants;
CREATE TRIGGER trg_pv_stock_changed_at
  BEFORE INSERT OR UPDATE OF stock ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.touch_stock_changed_at();
DROP TRIGGER IF EXISTS trg_p_stock_changed_at ON public.products;
CREATE TRIGGER trg_p_stock_changed_at
  BEFORE INSERT OR UPDATE OF stock ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.touch_stock_changed_at();

-- 9) Hepsiburada pazaryeri kanalı (manuel görev listesi için) zaten seed'li; yoksa ekle
INSERT INTO public.marketplace_channels (name, sort_order)
SELECT 'Hepsiburada', 2
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_channels WHERE name = 'Hepsiburada');
