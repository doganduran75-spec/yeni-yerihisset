-- ============================================================
-- Satış kanalları + WooCommerce aktarım altyapısı + e-posta kilidi
-- ============================================================
-- * sales_channels: siparişin geldiği platform etiketi (YeriHisset, Attipas,
--   Trendyol, Hepsiburada, ileride Ozon/Amazon…). Yeni kanal = tek satır.
--   orders.channel artık sabit CHECK yerine bu tabloya bağlı (FK).
-- * Aktarılan sipariş: orders.import_source/import_ref (20261008000001'de eklendi);
--   STOK DÜŞMEZ (stock_reduced_at boş kalır → otomatik iptal/stok iadesi de dokunmaz).
-- * legacy_sku_map: eski SKU → yeni varyant (elle bağlama); rematch_order_items()
--   aktarılan siparişlerin eşleşmeyen satırlarını SKU / barkod / bu eşlemeyle bağlar.
-- * account_password_state(): misafir alışverişte "şifresiz hesap" kontrolü.
-- * settings.email_lock_*: canlıya geçene kadar e-postalar yalnız izinli adreslere.

-- 1) Satış kanalları
CREATE TABLE IF NOT EXISTS public.sales_channels (
  code        text PRIMARY KEY CHECK (code ~ '^[a-z0-9_]+$'),
  label       text NOT NULL,
  kind        text NOT NULL DEFAULT 'marketplace' CHECK (kind IN ('site', 'marketplace', 'legacy')),
  color       text NOT NULL DEFAULT '#64748b',
  sort_order  integer NOT NULL DEFAULT 100,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.sales_channels (code, label, kind, color, sort_order, is_active) VALUES
  ('site',        'YeriHisset',  'site',        '#475569', 1,  true),
  ('attipas',     'Attipas',     'legacy',      '#db2777', 2,  true),
  ('trendyol',    'Trendyol',    'marketplace', '#ea580c', 10, true),
  ('hepsiburada', 'Hepsiburada', 'marketplace', '#d97706', 11, true),
  ('ozon',        'Ozon',        'marketplace', '#2563eb', 20, false),
  ('amazon',      'Amazon',      'marketplace', '#0f172a', 21, false)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.sales_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_channels_read ON public.sales_channels;
CREATE POLICY sales_channels_read ON public.sales_channels FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS sales_channels_admin ON public.sales_channels;
CREATE POLICY sales_channels_admin ON public.sales_channels FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT ON public.sales_channels TO authenticated;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_channel_chk;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_channel_fk') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_channel_fk
      FOREIGN KEY (channel) REFERENCES public.sales_channels(code) ON UPDATE CASCADE;
  END IF;
END $$;

-- 2) Aktarılan siparişin ek bilgileri
ALTER TABLE public.orders      ADD COLUMN IF NOT EXISTS extra_fee numeric(10,2) NOT NULL DEFAULT 0;  -- kapıda ödeme / taksit farkı vb.
ALTER TABLE public.orders      ADD COLUMN IF NOT EXISTS customer_note text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS size_label text;                             -- eski sitedeki numara (eşleşmese de)
CREATE INDEX IF NOT EXISTS idx_orders_import_source ON public.orders(import_source) WHERE import_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_unmatched ON public.order_items(order_id) WHERE product_id IS NULL;

-- 3) Eski SKU → yeni varyant (elle bağlama; yeniden eşleştirme ve sonraki aktarımlar kullanır)
CREATE TABLE IF NOT EXISTS public.legacy_sku_map (
  old_sku     text PRIMARY KEY,                       -- büyük harf, boşluksuz
  variant_id  uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.legacy_sku_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS legacy_sku_map_admin ON public.legacy_sku_map;
CREATE POLICY legacy_sku_map_admin ON public.legacy_sku_map FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.norm_sku(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT nullif(upper(regexp_replace(coalesce(p, ''), '\s+', '', 'g')), '') $$;

-- Aktarılan siparişlerin eşleşmeyen satırlarını bağla. Öncelik: elle eşleme → SKU → barkod.
-- Stoğa dokunmaz (geçmiş satış). Pazaryeri siparişlerine dokunmaz (onların stok kuralı ayrı).
CREATE OR REPLACE FUNCTION public.rematch_order_items()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT (public.is_admin() OR coalesce(auth.role(), '') = 'service_role' OR current_user IN ('postgres', 'supabase_admin')) THEN
    RAISE EXCEPTION 'Yetkisiz';
  END IF;

  WITH cand AS (
    SELECT oi.id AS item_id, m.variant_id
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id AND o.import_source IS NOT NULL
    CROSS JOIN LATERAL (
      SELECT x.variant_id FROM (
        SELECT lm.variant_id, 1 AS pr FROM public.legacy_sku_map lm WHERE lm.old_sku = public.norm_sku(oi.sku)
        UNION ALL
        SELECT pv.id, 2 FROM public.product_variants pv WHERE public.norm_sku(pv.sku) = public.norm_sku(oi.sku)
        UNION ALL
        SELECT pv.id, 3 FROM public.product_variants pv WHERE oi.barcode IS NOT NULL AND public.norm_sku(pv.barcode) = public.norm_sku(oi.barcode)
      ) x ORDER BY x.pr LIMIT 1
    ) m
    WHERE oi.product_id IS NULL AND (oi.sku IS NOT NULL OR oi.barcode IS NOT NULL)
  )
  UPDATE public.order_items oi
     SET variant_id = c.variant_id,
         product_id = (SELECT pv.product_id FROM public.product_variants pv WHERE pv.id = c.variant_id)
    FROM cand c
   WHERE oi.id = c.item_id;
  GET DIAGNOSTICS n = ROW_COUNT;

  RETURN jsonb_build_object(
    'matched', n,
    'unmatched', (SELECT count(*) FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
                   WHERE o.import_source IS NOT NULL AND oi.product_id IS NULL)
  );
END $$;
REVOKE ALL ON FUNCTION public.rematch_order_items() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rematch_order_items() TO authenticated, service_role;

-- 4) Şifresiz hesap kontrolü (misafir alışveriş: şifre belirlenmemiş hesaba sipariş verilebilir)
CREATE OR REPLACE FUNCTION public.account_password_state(p_email text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT coalesce((
    SELECT CASE WHEN coalesce(u.encrypted_password, '') = '' THEN 'passwordless' ELSE 'password' END
    FROM auth.users u WHERE lower(u.email) = lower(trim(p_email)) LIMIT 1
  ), 'none')
$$;
REVOKE ALL ON FUNCTION public.account_password_state(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_password_state(text) TO service_role;

-- 5) Sipariş numarası sayacı: eski yerihisset siparişleri KENDİ numaralarıyla gelir
--    (YH22559 aynı kalır). Sayaç, aktarılan en büyük numaranın üstüne çekilir →
--    yeni siparişler (site / pazaryeri / Attipas aktarımı) eski numaralarla çakışmaz.
CREATE OR REPLACE FUNCTION public.ensure_order_number_seq(p_min bigint DEFAULT 0)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur bigint; mx bigint;
BEGIN
  SELECT last_value INTO cur FROM public.order_number_seq;
  SELECT max(order_number::bigint) INTO mx FROM public.orders WHERE order_number ~ '^[0-9]{1,15}$';
  cur := greatest(cur, coalesce(mx, 0), coalesce(p_min, 0));
  PERFORM setval('public.order_number_seq', cur, true);   -- sıradaki numara = cur + 1
  RETURN cur + 1;
END $$;
REVOKE ALL ON FUNCTION public.ensure_order_number_seq(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_order_number_seq(bigint) TO service_role;

-- 6) E-posta kilidi (varsayılan AÇIK; canlıya geçiş günü kapatılır). Yeni settings
--    kolonları anon/authenticated'a kapalı kalır (yalnız admin API okur).
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS email_lock_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS email_allowlist text NOT NULL DEFAULT '';
