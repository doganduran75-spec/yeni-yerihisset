-- Pazaryeri STOK SENKRONU (v2: API) — ilk kanal Trendyol.
-- Website stoku TEK KAYNAK. Bir varyantın stoğu (ya da barkodu) nereden
-- değişirse değişsin (admin ürün sayfası, site siparişi, iptal/iade, toplu
-- içe aktarma) tetikleyici bu kuyruğa "gönderilecek stok" yazar; sunucudaki
-- işleyici (src/lib/marketplace/sync.ts) kuyruğu Trendyol API'sine iletir.
-- Anlık tetik: ürün kaydı / sipariş; yedek: dakikalık cron.
-- Tekrar çalıştırmak güvenli (idempotent).

-- 1) Entegrasyon ayarları (settings). Yeni kolonlar anon/authenticated'a
--    KAPALI kalır (20260926000001 kolon yetkisi yalnız o anki kolonlara verildi).
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS trendyol_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trendyol_seller_id text,
  ADD COLUMN IF NOT EXISTS trendyol_api_key text,
  ADD COLUMN IF NOT EXISTS trendyol_api_secret text,
  ADD COLUMN IF NOT EXISTS trendyol_stage boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kargonomi_enabled boolean NOT NULL DEFAULT true;

-- 2) Kuyruk: (kanal, varyant) başına TEK satır — en son istenen stok.
CREATE TABLE IF NOT EXISTS public.marketplace_stock_sync (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL DEFAULT 'trendyol',
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  barcode text NOT NULL,
  desired_qty int NOT NULL,            -- gönderilmesi gereken güncel stok
  sending_qty int,                     -- işleyicinin şu an gönderdiği
  last_sent_qty int,                   -- en son kabul edilen gönderim
  status text NOT NULL DEFAULT 'pending', -- pending | sending | sent | ok | failed
  batch_request_id text,
  error text,
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  confirmed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, variant_id)
);
CREATE INDEX IF NOT EXISTS idx_mss_status ON public.marketplace_stock_sync(channel, status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_mss_batch ON public.marketplace_stock_sync(batch_request_id) WHERE status = 'sent';

-- Yalnız sunucu (service_role) erişir; politika yok = istemciye kapalı.
ALTER TABLE public.marketplace_stock_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_stock_sync FROM anon, authenticated;

-- 3) Tetikleyici: stok/barkod değişince (veya yeni varyant) kuyruğa yaz.
--    SECURITY DEFINER: değişikliği yapan rol (admin/müşteri) kuyruğa doğrudan
--    yazamaz; fonksiyon sahibinin yetkisiyle yazılır.
CREATE OR REPLACE FUNCTION public.enqueue_marketplace_stock()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.barcode IS NULL OR btrim(NEW.barcode) = '' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.stock IS NOT DISTINCT FROM OLD.stock
     AND NEW.barcode IS NOT DISTINCT FROM OLD.barcode THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.marketplace_stock_sync
    (channel, variant_id, product_id, barcode, desired_qty, status, attempts, next_attempt_at, error, updated_at)
  VALUES
    ('trendyol', NEW.id, NEW.product_id, btrim(NEW.barcode),
     GREATEST(0, LEAST(COALESCE(NEW.stock, 0), 20000)), 'pending', 0, now(), NULL, now())
  ON CONFLICT (channel, variant_id) DO UPDATE SET
    barcode = EXCLUDED.barcode,
    product_id = EXCLUDED.product_id,
    desired_qty = EXCLUDED.desired_qty,
    -- gönderim sürerken gelen değişiklik: 'sending' kalır; işleyici bitince
    -- desired ≠ sending olduğunu görüp tekrar 'pending' yapar
    status = CASE WHEN public.marketplace_stock_sync.status = 'sending' THEN 'sending' ELSE 'pending' END,
    attempts = 0,
    next_attempt_at = now(),
    error = NULL,
    updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketplace_stock ON public.product_variants;
CREATE TRIGGER trg_marketplace_stock
  AFTER INSERT OR UPDATE OF stock, barcode ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_marketplace_stock();

-- 4) İşleyici yardımcıları (yalnız service_role çağırır)

-- Gönderilecek satırları KİLİTLEYEREK al (aynı anda iki işleyici aynı satırı göndermesin).
-- 5 dk'dan uzun 'sending'de kalan (çöken işleyici) satırlar geri alınır.
CREATE OR REPLACE FUNCTION public.claim_marketplace_stock(p_channel text, p_limit int)
RETURNS SETOF public.marketplace_stock_sync
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.marketplace_stock_sync s
     SET status = 'sending', sending_qty = s.desired_qty, updated_at = now()
   WHERE s.id IN (
     SELECT id FROM public.marketplace_stock_sync
      WHERE channel = p_channel
        AND ((status = 'pending' AND next_attempt_at <= now())
          OR (status = 'sending' AND updated_at < now() - interval '5 minutes'))
      ORDER BY updated_at
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED)
  RETURNING s.*;
$$;

-- Trendyol isteği kabul etti (batchRequestId). Gönderim sırasında stok yine
-- değiştiyse satır 'pending'e döner ve bir sonraki turda yeni değer gider.
CREATE OR REPLACE FUNCTION public.mark_marketplace_stock_sent(p_ids uuid[], p_batch text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.marketplace_stock_sync
     SET last_sent_qty = sending_qty,
         batch_request_id = p_batch,
         sent_at = now(),
         error = NULL,
         attempts = 0,
         status = CASE WHEN desired_qty = sending_qty THEN 'sent' ELSE 'pending' END,
         next_attempt_at = now(),
         updated_at = now()
   WHERE id = ANY(p_ids) AND status = 'sending';
$$;

-- İstek başarısız (ağ/429/5xx/yetki): artan bekleme ile tekrar dene; 8 denemeden sonra 'failed'.
CREATE OR REPLACE FUNCTION public.mark_marketplace_stock_retry(p_ids uuid[], p_error text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.marketplace_stock_sync
     SET attempts = attempts + 1,
         error = left(p_error, 500),
         status = CASE WHEN attempts + 1 >= 8 THEN 'failed' ELSE 'pending' END,
         next_attempt_at = now() + (LEAST(30, power(2, attempts))::int * interval '1 minute'),
         updated_at = now()
   WHERE id = ANY(p_ids) AND status = 'sending';
$$;

-- "Tüm stokları gönder": barkodlu TÜM varyantları kuyruğa al (ilk eşitleme / kontrol).
CREATE OR REPLACE FUNCTION public.enqueue_all_marketplace_stock(p_channel text)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  INSERT INTO public.marketplace_stock_sync
    (channel, variant_id, product_id, barcode, desired_qty, status, attempts, next_attempt_at, error, updated_at)
  SELECT p_channel, v.id, v.product_id, btrim(v.barcode),
         GREATEST(0, LEAST(COALESCE(v.stock, 0), 20000)), 'pending', 0, now(), NULL, now()
    FROM public.product_variants v
   WHERE v.barcode IS NOT NULL AND btrim(v.barcode) <> ''
  ON CONFLICT (channel, variant_id) DO UPDATE SET
    barcode = EXCLUDED.barcode,
    desired_qty = EXCLUDED.desired_qty,
    status = CASE WHEN public.marketplace_stock_sync.status = 'sending' THEN 'sending' ELSE 'pending' END,
    attempts = 0, next_attempt_at = now(), error = NULL, updated_at = now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_marketplace_stock(text, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_marketplace_stock_sent(uuid[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_marketplace_stock_retry(uuid[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_all_marketplace_stock(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_marketplace_stock(text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_marketplace_stock_sent(uuid[], text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_marketplace_stock_retry(uuid[], text) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_all_marketplace_stock(text) TO service_role;
GRANT ALL ON public.marketplace_stock_sync TO service_role;
