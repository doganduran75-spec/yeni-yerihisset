-- ============================================================
-- PAZARYERİ: AMAZON (Amazon.com.tr) — STOK SENKRONU + SİPARİŞ AKTARIMI
-- ============================================================
-- Trendyol / Hepsiburada ile aynı kuyruk + ilan eşitleme + "Kapalı" + tampon + sipariş altyapısı.
-- Amazon'daki satıcı SKU'su = sitedeki varyant SKU'su (ya da ayara göre barkodu). Yalnız satıcı
-- gönderimli (FBM) stok yazılır / siparişler alınır.
-- Fark: Amazon'da ilk ilan eşitlemesine kadar HİÇBİR ürüne stok gitmez (Trendyol/HB'de eşitlemeden
-- önce hepsine gidiyordu) — Amazon'da ilanı olmayan SKU'lar hata üretmesin.
-- Avrupa pazaryerleri ileride: aynı uç, amazon_marketplace_id değişir.
-- Önkoşul: 20261018000001_marketplace_listings. Tekrar çalıştırmak güvenli.

-- 1) Ayarlar (gizli kolonlar: anon/authenticated'a kapalı — sütun bazlı GRANT modeli)
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS amazon_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS amazon_seller_id text,                 -- Satıcı token'ı (Merchant Token)
  ADD COLUMN IF NOT EXISTS amazon_lwa_client_id text,
  ADD COLUMN IF NOT EXISTS amazon_lwa_client_secret text,
  ADD COLUMN IF NOT EXISTS amazon_refresh_token text,
  ADD COLUMN IF NOT EXISTS amazon_marketplace_id text NOT NULL DEFAULT 'A33AVAJ2PDY3EV',  -- Amazon.com.tr
  ADD COLUMN IF NOT EXISTS amazon_match_field text NOT NULL DEFAULT 'sku',                -- 'sku' | 'barcode'
  ADD COLUMN IF NOT EXISTS amazon_stock_buffer int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amazon_orders_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS amazon_orders_since timestamptz;       -- bu andan ÖNCEKİ siparişler alınmaz

-- 2) Kanal için ilan anahtarı (Hepsiburada + Amazon: ayara göre SKU ya da barkod)
CREATE OR REPLACE FUNCTION public.marketplace_listing_key(p_channel text, p_barcode text, p_sku text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULLIF(btrim(CASE
    WHEN p_channel = 'hepsiburada'
     AND COALESCE((SELECT hepsiburada_match_field FROM public.settings ORDER BY id LIMIT 1), 'barcode') = 'sku'
      THEN p_sku
    WHEN p_channel = 'amazon'
      THEN CASE WHEN COALESCE((SELECT amazon_match_field FROM public.settings ORDER BY id LIMIT 1), 'sku') = 'barcode'
                THEN p_barcode ELSE p_sku END
    ELSE p_barcode
  END), '');
$$;

-- 3) İlanda mı? Amazon: yalnız eşitlenmiş ilan listesinde olanlar
CREATE OR REPLACE FUNCTION public.marketplace_is_listed(p_channel text, p_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_key IS NOT NULL AND (
    (p_channel <> 'amazon' AND NOT EXISTS (SELECT 1 FROM public.marketplace_listing_state s WHERE s.channel = p_channel AND s.last_ok_at IS NOT NULL))
    OR EXISTS (SELECT 1 FROM public.marketplace_listings l WHERE l.channel = p_channel AND l.listing_key = upper(btrim(p_key)))
  )
$$;

-- 4) Gönderilecek stok: Kapalı → 0; değilse stok − tampon (Trendyol en çok 20.000)
CREATE OR REPLACE FUNCTION public.marketplace_send_qty(p_channel text, p_variant uuid, p_stock int)
RETURNS int LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b int; q int;
BEGIN
  IF EXISTS (SELECT 1 FROM public.marketplace_closed_listings c WHERE c.channel = p_channel AND c.variant_id = p_variant) THEN
    RETURN 0;
  END IF;
  SELECT CASE p_channel
           WHEN 'trendyol' THEN s.trendyol_stock_buffer
           WHEN 'hepsiburada' THEN s.hepsiburada_stock_buffer
           WHEN 'amazon' THEN s.amazon_stock_buffer
           ELSE 0 END
    INTO b FROM public.settings s ORDER BY s.id LIMIT 1;
  q := GREATEST(0, COALESCE(p_stock, 0) - GREATEST(COALESCE(b, 0), 0));
  IF p_channel = 'trendyol' THEN q := LEAST(q, 20000); END IF;
  RETURN q;
END $$;

-- 5) Stok tetikleyicisi: Amazon da kuyruğa
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
  FOREACH ch IN ARRAY ARRAY['trendyol', 'hepsiburada', 'amazon'] LOOP
    PERFORM public.marketplace_enqueue_variant(ch, NEW.id);
  END LOOP;
  RETURN NEW;
END $$;

-- 6) Fiyatlar sayfası "Kapalı" kutusu: Amazon da
CREATE OR REPLACE FUNCTION public.set_marketplace_closed(p_items jsonb)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it jsonb; n int := 0; ch text; vid uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) LOOP
    ch := it ->> 'channel';
    vid := (it ->> 'variant_id')::uuid;
    CONTINUE WHEN ch NOT IN ('trendyol', 'hepsiburada', 'amazon') OR vid IS NULL;
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

-- 7) Fiyatlar sayfası: varyantın kanal durumu (Amazon sütunları eklendi → dönüş tipi değişti)
DROP FUNCTION IF EXISTS public.admin_marketplace_variant_status();
CREATE FUNCTION public.admin_marketplace_variant_status()
RETURNS TABLE (variant_id uuid,
               ty_key boolean, ty_listed boolean, ty_closed boolean,
               hb_key boolean, hb_listed boolean, hb_closed boolean,
               az_key boolean, az_listed boolean, az_closed boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  RETURN QUERY
  SELECT v.id,
         tk.k IS NOT NULL, public.marketplace_is_listed('trendyol', tk.k),
         EXISTS (SELECT 1 FROM public.marketplace_closed_listings c WHERE c.channel = 'trendyol' AND c.variant_id = v.id),
         hk.k IS NOT NULL, public.marketplace_is_listed('hepsiburada', hk.k),
         EXISTS (SELECT 1 FROM public.marketplace_closed_listings c WHERE c.channel = 'hepsiburada' AND c.variant_id = v.id),
         ak.k IS NOT NULL, public.marketplace_is_listed('amazon', ak.k),
         EXISTS (SELECT 1 FROM public.marketplace_closed_listings c WHERE c.channel = 'amazon' AND c.variant_id = v.id)
  FROM public.product_variants v
  CROSS JOIN LATERAL (SELECT public.marketplace_listing_key('trendyol', v.barcode, v.sku) AS k) tk
  CROSS JOIN LATERAL (SELECT public.marketplace_listing_key('hepsiburada', v.barcode, v.sku) AS k) hk
  CROSS JOIN LATERAL (SELECT public.marketplace_listing_key('amazon', v.barcode, v.sku) AS k) ak;
END $$;
REVOKE ALL ON FUNCTION public.admin_marketplace_variant_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_marketplace_variant_status() TO authenticated;

-- 8) Manuel "Pazaryeri Stok Görevi" listesi için kanal + satış kanalı (siparişler filtresi)
INSERT INTO public.marketplace_channels (name, sort_order)
SELECT 'Amazon', 3
WHERE NOT EXISTS (SELECT 1 FROM public.marketplace_channels WHERE name = 'Amazon');
UPDATE public.sales_channels SET is_active = true WHERE code = 'amazon';

SELECT 'amazon stok + sipariş hazır' AS durum,
       (SELECT count(*) FROM public.product_variants WHERE NULLIF(btrim(sku), '') IS NOT NULL) AS skulu_varyant;
