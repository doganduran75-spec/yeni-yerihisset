-- ============================================================
-- PAZARYERİ İLANLARI + "KAPALI" + STOK TAMPONU
-- ============================================================
-- Sorun: stok/fiyat, SKU/barkodu olan HER varyant için açık her pazaryerine gidiyordu;
-- o pazaryerinde ilanı olmayan ürün (ör. Attipas YYY Hepsiburada'da yok) sürekli hata
-- üretiyordu. Artık:
--   * marketplace_listings: pazaryerinden çekilen İLANDAKİ anahtarlar (Trendyol barkod,
--     Hepsiburada satıcı stok kodu). Saatlik + elle "İlanları eşitle" (src/lib/marketplace/listings.ts).
--   * Stok ve fiyat YALNIZ o kanalda ilanı olan varyanta gider (ilk eşitlemeye kadar eski
--     davranış: hepsi). İlanı olmayana hiç gönderilmez → hata yok.
--   * marketplace_closed_listings: Fiyatlar sayfasındaki "Kapalı" kutusu → ilandaki
--     varyanta o kanalda STOK 0 gider (stok değişse de 0 kalır). Kutu kalkınca gerçek stok.
--   * settings.{trendyol,hepsiburada}_stock_buffer: kanala "stok − tampon" gönderilir (varsayılan 0).

CREATE TABLE IF NOT EXISTS public.marketplace_listings (
  channel      text NOT NULL,
  listing_key  text NOT NULL,                 -- BÜYÜK harf, boşluksuz kenar
  seen_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel, listing_key)
);
CREATE TABLE IF NOT EXISTS public.marketplace_listing_state (
  channel      text PRIMARY KEY,
  last_run_at  timestamptz,
  last_ok_at   timestamptz,                   -- NULL = hiç eşitlenmedi → herkese gönder (eski davranış)
  count        int,
  message      text
);
CREATE TABLE IF NOT EXISTS public.marketplace_closed_listings (
  channel     text NOT NULL,
  variant_id  uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  closed_at   timestamptz NOT NULL DEFAULT now(),
  closed_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (channel, variant_id)
);
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_listing_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_closed_listings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mkt_listings_admin_read ON public.marketplace_listings;
CREATE POLICY mkt_listings_admin_read ON public.marketplace_listings FOR SELECT USING (public.is_admin());
DROP POLICY IF EXISTS mkt_listing_state_admin_read ON public.marketplace_listing_state;
CREATE POLICY mkt_listing_state_admin_read ON public.marketplace_listing_state FOR SELECT USING (public.is_admin());
DROP POLICY IF EXISTS mkt_closed_admin_read ON public.marketplace_closed_listings;
CREATE POLICY mkt_closed_admin_read ON public.marketplace_closed_listings FOR SELECT USING (public.is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.marketplace_listings, public.marketplace_listing_state, public.marketplace_closed_listings FROM anon, authenticated;

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS trendyol_stock_buffer int NOT NULL DEFAULT 0;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS hepsiburada_stock_buffer int NOT NULL DEFAULT 0;

-- Bu kanalda ilanda mı? (kanal hiç eşitlenmediyse: evet — eski davranış)
CREATE OR REPLACE FUNCTION public.marketplace_is_listed(p_channel text, p_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_key IS NOT NULL AND (
    NOT EXISTS (SELECT 1 FROM public.marketplace_listing_state s WHERE s.channel = p_channel AND s.last_ok_at IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.marketplace_listings l WHERE l.channel = p_channel AND l.listing_key = upper(btrim(p_key)))
  )
$$;

-- Kanala gönderilecek stok: Kapalı → 0; değilse stok − tampon (Trendyol en çok 20.000)
CREATE OR REPLACE FUNCTION public.marketplace_send_qty(p_channel text, p_variant uuid, p_stock int)
RETURNS int LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b int; q int;
BEGIN
  IF EXISTS (SELECT 1 FROM public.marketplace_closed_listings c WHERE c.channel = p_channel AND c.variant_id = p_variant) THEN
    RETURN 0;
  END IF;
  SELECT CASE p_channel WHEN 'trendyol' THEN s.trendyol_stock_buffer WHEN 'hepsiburada' THEN s.hepsiburada_stock_buffer ELSE 0 END
    INTO b FROM public.settings s ORDER BY s.id LIMIT 1;
  q := GREATEST(0, COALESCE(p_stock, 0) - GREATEST(COALESCE(b, 0), 0));
  IF p_channel = 'trendyol' THEN q := LEAST(q, 20000); END IF;
  RETURN q;
END $$;

-- Tek varyantı bir kanal için kuyruğa al (ilanda değilse kuyruktan çıkar)
CREATE OR REPLACE FUNCTION public.marketplace_enqueue_variant(p_channel text, p_variant uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; k text;
BEGIN
  SELECT id, product_id, barcode, sku, stock INTO v FROM public.product_variants WHERE id = p_variant;
  IF NOT FOUND THEN RETURN; END IF;
  k := public.marketplace_listing_key(p_channel, v.barcode, v.sku);
  IF k IS NULL OR NOT public.marketplace_is_listed(p_channel, k) THEN
    DELETE FROM public.marketplace_stock_sync WHERE channel = p_channel AND variant_id = p_variant AND status <> 'sending';
    RETURN;
  END IF;
  INSERT INTO public.marketplace_stock_sync
    (channel, variant_id, product_id, barcode, desired_qty, status, attempts, next_attempt_at, error, updated_at)
  VALUES (p_channel, v.id, v.product_id, k, public.marketplace_send_qty(p_channel, v.id, v.stock), 'pending', 0, now(), NULL, now())
  ON CONFLICT (channel, variant_id) DO UPDATE SET
    barcode = EXCLUDED.barcode,
    product_id = EXCLUDED.product_id,
    desired_qty = EXCLUDED.desired_qty,
    status = CASE WHEN public.marketplace_stock_sync.status = 'sending' THEN 'sending' ELSE 'pending' END,
    attempts = 0, next_attempt_at = now(), error = NULL, updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.marketplace_enqueue_variant(text, uuid) FROM PUBLIC, anon, authenticated;

-- Stok tetikleyicisi: ilandakilere, kapalı/tampon kuralıyla
CREATE OR REPLACE FUNCTION public.enqueue_marketplace_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ch text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.stock IS NOT DISTINCT FROM OLD.stock
     AND NEW.barcode IS NOT DISTINCT FROM OLD.barcode
     AND NEW.sku IS NOT DISTINCT FROM OLD.sku THEN
    RETURN NEW;
  END IF;
  FOREACH ch IN ARRAY ARRAY['trendyol', 'hepsiburada'] LOOP
    PERFORM public.marketplace_enqueue_variant(ch, NEW.id);
  END LOOP;
  RETURN NEW;
END $$;

-- "Tüm stokları gönder": yalnız ilandakiler; ilanda olmayanların bekleyen/hatalı kayıtları silinir
CREATE OR REPLACE FUNCTION public.enqueue_all_marketplace_stock(p_channel text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  INSERT INTO public.marketplace_stock_sync
    (channel, variant_id, product_id, barcode, desired_qty, status, attempts, next_attempt_at, error, updated_at)
  SELECT p_channel, v.id, v.product_id, k.key, public.marketplace_send_qty(p_channel, v.id, v.stock),
         'pending', 0, now(), NULL, now()
    FROM public.product_variants v
    CROSS JOIN LATERAL (SELECT public.marketplace_listing_key(p_channel, v.barcode, v.sku) AS key) k
   WHERE k.key IS NOT NULL AND public.marketplace_is_listed(p_channel, k.key)
  ON CONFLICT (channel, variant_id) DO UPDATE SET
    barcode = EXCLUDED.barcode,
    desired_qty = EXCLUDED.desired_qty,
    status = CASE WHEN public.marketplace_stock_sync.status = 'sending' THEN 'sending' ELSE 'pending' END,
    attempts = 0, next_attempt_at = now(), error = NULL, updated_at = now();
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM public.marketplace_stock_sync s
   USING public.product_variants v
   WHERE s.channel = p_channel AND s.variant_id = v.id AND s.status <> 'sending'
     AND NOT public.marketplace_is_listed(p_channel, public.marketplace_listing_key(p_channel, v.barcode, v.sku));
  RETURN n;
END $$;

-- Fiyat kuyruğu: yalnız ilandakiler
CREATE OR REPLACE FUNCTION public.enqueue_marketplace_prices(p_channel text, p_variant_ids uuid[])
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
     AND public.marketplace_is_listed(p_channel, k.key)
  ON CONFLICT (channel, variant_id) DO UPDATE SET
    listing_key = EXCLUDED.listing_key,
    sale_price = EXCLUDED.sale_price,
    list_price = EXCLUDED.list_price,
    status = CASE WHEN public.marketplace_price_sync.status = 'sending' THEN 'sending' ELSE 'pending' END,
    attempts = 0, next_attempt_at = now(), error = NULL, updated_at = now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- İlan listesini uygula (pazaryerinden çekilen anahtarlar). Yeni ilana mevcut stok gönderilir;
-- ilandan kalkanların bekleyen/hatalı stok ve fiyat kayıtları temizlenir.
CREATE OR REPLACE FUNCTION public.apply_marketplace_listings(p_channel text, p_keys text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE prev int; n_new int; n_added int := 0; n_removed int := 0; first_time boolean; v record;
BEGIN
  SELECT count(*) INTO prev FROM public.marketplace_listings WHERE channel = p_channel;
  n_new := (SELECT count(DISTINCT upper(btrim(k))) FROM unnest(coalesce(p_keys, '{}')) k WHERE btrim(coalesce(k, '')) <> '');
  IF n_new = 0 AND prev > 0 THEN
    INSERT INTO public.marketplace_listing_state (channel, last_run_at, message)
    VALUES (p_channel, now(), 'Pazaryeri 0 ilan döndürdü; önceki liste korundu')
    ON CONFLICT (channel) DO UPDATE SET last_run_at = now(), message = EXCLUDED.message;
    RETURN jsonb_build_object('ok', false, 'message', 'Pazaryeri 0 ilan döndürdü; önceki liste korundu');
  END IF;
  SELECT (s.last_ok_at IS NULL) INTO first_time FROM public.marketplace_listing_state s WHERE s.channel = p_channel;
  first_time := coalesce(first_time, true);

  DROP TABLE IF EXISTS _mkt_keys, _mkt_added;
  CREATE TEMP TABLE _mkt_keys ON COMMIT DROP AS
    SELECT DISTINCT upper(btrim(k)) AS k FROM unnest(coalesce(p_keys, '{}')) k WHERE btrim(coalesce(k, '')) <> '';
  CREATE TEMP TABLE _mkt_added (k text) ON COMMIT DROP;

  WITH ins AS (
    INSERT INTO public.marketplace_listings (channel, listing_key)
    SELECT p_channel, k FROM _mkt_keys
    ON CONFLICT (channel, listing_key) DO UPDATE SET seen_at = now()
    RETURNING listing_key, (xmax = 0) AS inserted
  )
  INSERT INTO _mkt_added SELECT listing_key FROM ins WHERE inserted;
  SELECT count(*) INTO n_added FROM _mkt_added;

  DELETE FROM public.marketplace_listings l
   WHERE l.channel = p_channel AND NOT EXISTS (SELECT 1 FROM _mkt_keys x WHERE x.k = l.listing_key);
  GET DIAGNOSTICS n_removed = ROW_COUNT;

  INSERT INTO public.marketplace_listing_state (channel, last_run_at, last_ok_at, count, message)
  VALUES (p_channel, now(), now(), n_new, NULL)
  ON CONFLICT (channel) DO UPDATE SET last_run_at = now(), last_ok_at = now(), count = n_new, message = NULL;

  -- İlanda olmayanların bekleyen / hatalı kuyruk kayıtları (hata listesi temizlenir)
  DELETE FROM public.marketplace_stock_sync s
   WHERE s.channel = p_channel AND s.status <> 'sending'
     AND NOT EXISTS (SELECT 1 FROM public.marketplace_listings l WHERE l.channel = p_channel AND l.listing_key = upper(btrim(s.barcode)));
  DELETE FROM public.marketplace_price_sync s
   WHERE s.channel = p_channel AND s.status <> 'sending'
     AND NOT EXISTS (SELECT 1 FROM public.marketplace_listings l WHERE l.channel = p_channel AND l.listing_key = upper(btrim(s.listing_key)));

  -- Yeni ilana (ilk eşitlemede değil — o zaman zaten herkese gidiyordu) mevcut stoğu gönder
  IF NOT first_time AND n_added > 0 THEN
    FOR v IN
      SELECT pv.id FROM public.product_variants pv
      WHERE upper(btrim(public.marketplace_listing_key(p_channel, pv.barcode, pv.sku))) IN (SELECT k FROM _mkt_added)
    LOOP
      PERFORM public.marketplace_enqueue_variant(p_channel, v.id);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'count', n_new, 'added', CASE WHEN first_time THEN 0 ELSE n_added END,
                            'removed', n_removed, 'first_time', first_time);
END $$;
REVOKE ALL ON FUNCTION public.apply_marketplace_listings(text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_marketplace_listings(text, text[]) TO service_role;

-- Fiyatlar sayfası: "Kapalı" kutuları (anında uygulanır)
CREATE OR REPLACE FUNCTION public.set_marketplace_closed(p_items jsonb)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it jsonb; n int := 0; ch text; vid uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) LOOP
    ch := it ->> 'channel';
    vid := (it ->> 'variant_id')::uuid;
    CONTINUE WHEN ch NOT IN ('trendyol', 'hepsiburada') OR vid IS NULL;
    IF coalesce((it ->> 'closed')::boolean, false) THEN
      INSERT INTO public.marketplace_closed_listings (channel, variant_id, closed_by)
      VALUES (ch, vid, CASE WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()) THEN auth.uid() END)
      ON CONFLICT (channel, variant_id) DO NOTHING;
    ELSE
      DELETE FROM public.marketplace_closed_listings WHERE channel = ch AND variant_id = vid;
    END IF;
    PERFORM public.marketplace_enqueue_variant(ch, vid);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.set_marketplace_closed(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_marketplace_closed(jsonb) TO authenticated;

-- Fiyatlar sayfası: her varyantın kanal durumu (ilanda / kapalı)
CREATE OR REPLACE FUNCTION public.admin_marketplace_variant_status()
RETURNS TABLE (variant_id uuid, ty_key boolean, ty_listed boolean, ty_closed boolean, hb_key boolean, hb_listed boolean, hb_closed boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  RETURN QUERY
  SELECT v.id,
         tk.k IS NOT NULL, public.marketplace_is_listed('trendyol', tk.k),
         EXISTS (SELECT 1 FROM public.marketplace_closed_listings c WHERE c.channel = 'trendyol' AND c.variant_id = v.id),
         hk.k IS NOT NULL, public.marketplace_is_listed('hepsiburada', hk.k),
         EXISTS (SELECT 1 FROM public.marketplace_closed_listings c WHERE c.channel = 'hepsiburada' AND c.variant_id = v.id)
  FROM public.product_variants v
  CROSS JOIN LATERAL (SELECT public.marketplace_listing_key('trendyol', v.barcode, v.sku) AS k) tk
  CROSS JOIN LATERAL (SELECT public.marketplace_listing_key('hepsiburada', v.barcode, v.sku) AS k) hk;
END $$;
REVOKE ALL ON FUNCTION public.admin_marketplace_variant_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_marketplace_variant_status() TO authenticated;

SELECT 'marketplace_listings hazır' AS durum;
