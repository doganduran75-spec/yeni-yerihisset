-- Pazaryeri FİYAT gönderimi (Trendyol: satış + PSF, Hepsiburada: satış).
-- Stoktan farkı: OTOMATİK DEĞİL — Fiyatlar sayfasında "Kaydet ve pazaryerlerine gönder"
-- (ya da "filtrelenmişi gönder") ile kuyruğa girer. İşleyici: src/lib/marketplace/price-sync.ts.
-- Önkoşul: 20261004000001 (marketplace_listing_key, marketplace_stock_log), 20261006000001 (price_lists).
-- Tekrar çalıştırmak güvenli.

CREATE TABLE IF NOT EXISTS public.marketplace_price_sync (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  listing_key text NOT NULL,
  sale_price numeric(12,2) NOT NULL,
  list_price numeric(12,2),
  sending_sale numeric(12,2),
  sending_list numeric(12,2),
  status text NOT NULL DEFAULT 'pending',   -- pending | sending | sent | ok | failed
  batch_request_id text,
  batch_pos int,
  error text,
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  confirmed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, variant_id)
);
CREATE INDEX IF NOT EXISTS idx_mps_status ON public.marketplace_price_sync(channel, status, next_attempt_at);
ALTER TABLE public.marketplace_price_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_price_sync FROM anon, authenticated;
GRANT ALL ON public.marketplace_price_sync TO service_role;

-- Geçmişte stok mu fiyat mı (Otomatik Senkron sekmesi)
ALTER TABLE public.marketplace_stock_log
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'stock',   -- stock | price
  ADD COLUMN IF NOT EXISTS price numeric(12,2);

-- Kuyruğa al: verilen varyantlar için kanalın fiyat listelerinden (satış zorunlu) güncel fiyat.
-- p_items: [{variant_id}]  — p_channel: 'trendyol' | 'hepsiburada'
CREATE OR REPLACE FUNCTION public.enqueue_marketplace_prices(p_channel text, p_variant_ids uuid[])
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  INSERT INTO public.marketplace_price_sync
    (channel, variant_id, product_id, listing_key, sale_price, list_price, status, attempts, next_attempt_at, error, updated_at)
  SELECT p_channel, v.id, v.product_id, k.key, s.amount, l.amount, 'pending', 0, now(), NULL, now()
    FROM public.product_variants v
    CROSS JOIN LATERAL (SELECT public.marketplace_listing_key(p_channel, v.barcode, v.sku) AS key) k
    JOIN public.price_lists sl ON sl.code = p_channel || '_sale'
    JOIN public.item_prices s ON s.price_list_id = sl.id AND s.variant_id = v.id
    LEFT JOIN public.price_lists ll ON ll.code = p_channel || '_list'
    LEFT JOIN public.item_prices l ON l.price_list_id = ll.id AND l.variant_id = v.id
   WHERE v.id = ANY(p_variant_ids) AND k.key IS NOT NULL AND s.amount > 0
  ON CONFLICT (channel, variant_id) DO UPDATE SET
    listing_key = EXCLUDED.listing_key,
    sale_price = EXCLUDED.sale_price,
    list_price = EXCLUDED.list_price,
    status = CASE WHEN public.marketplace_price_sync.status = 'sending' THEN 'sending' ELSE 'pending' END,
    attempts = 0, next_attempt_at = now(), error = NULL, updated_at = now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_marketplace_price(p_channel text, p_limit int)
RETURNS SETOF public.marketplace_price_sync
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.marketplace_price_sync s
     SET status = 'sending', sending_sale = s.sale_price, sending_list = s.list_price, updated_at = now()
   WHERE s.id IN (
     SELECT id FROM public.marketplace_price_sync
      WHERE channel = p_channel
        AND ((status = 'pending' AND next_attempt_at <= now())
          OR (status = 'sending' AND updated_at < now() - interval '5 minutes'))
      ORDER BY updated_at
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED)
  RETURNING s.*;
$$;

CREATE OR REPLACE FUNCTION public.mark_marketplace_price_sent(p_ids uuid[], p_batch text, p_pos int[])
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.marketplace_price_sync s
     SET batch_request_id = p_batch,
         batch_pos = p_pos[array_position(p_ids, s.id)],
         sent_at = now(), error = NULL, attempts = 0,
         status = CASE WHEN s.sale_price = s.sending_sale AND s.list_price IS NOT DISTINCT FROM s.sending_list THEN 'sent' ELSE 'pending' END,
         next_attempt_at = now(), updated_at = now()
   WHERE s.id = ANY(p_ids) AND s.status = 'sending';
$$;

CREATE OR REPLACE FUNCTION public.mark_marketplace_price_retry(p_ids uuid[], p_error text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.marketplace_price_sync
     SET attempts = attempts + 1,
         error = left(p_error, 500),
         status = CASE WHEN attempts + 1 >= 8 THEN 'failed' ELSE 'pending' END,
         next_attempt_at = now() + (LEAST(30, power(2, attempts))::int * interval '1 minute'),
         updated_at = now()
   WHERE id = ANY(p_ids) AND status = 'sending';
$$;

REVOKE ALL ON FUNCTION public.enqueue_marketplace_prices(text, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_marketplace_price(text, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_marketplace_price_sent(uuid[], text, int[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_marketplace_price_retry(uuid[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_marketplace_prices(text, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_marketplace_price(text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_marketplace_price_sent(uuid[], text, int[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_marketplace_price_retry(uuid[], text) TO service_role;
