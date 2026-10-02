-- Pazaryeri SİPARİŞLERİ (Trendyol → sonra Hepsiburada) sitenin siparişlerine aktarılır.
-- Kurallar (kullanıcıyla kararlaştırıldı 2026-10-02):
--  * Pazaryeri müşterisi siteye ÜYE YAPILMAZ: orders.user_id boş, müşteri/adres siparişin içinde.
--  * Pazaryeri siparişine bizden e-posta gitmez (sendOrderNotification channel<>'site' ise atlar).
--  * Stok KALEM BAZINDA ve TEK SEFERLİK düşer/iade edilir (kısmi iptal desteklenir);
--    sitenin reduce/restore_order_stock akışından ayrıdır (stock_reduced_at kullanılmaz → çift iade yok).
--  * Sipariş durumu pazaryerinden gelir; iptalde stok otomatik geri eklenir, iadede admin onayıyla.
-- Tekrar çalıştırmak güvenli.

-- 1) orders: kanal + pazaryeri alanları
ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'site',     -- site | trendyol | hepsiburada
  ADD COLUMN IF NOT EXISTS external_order_number text,               -- pazaryerinin sipariş no'su
  ADD COLUMN IF NOT EXISTS external_package_id text,                 -- pazaryerinin paket id'si (benzersiz)
  ADD COLUMN IF NOT EXISTS external_status text,                     -- pazaryerindeki ham durum
  ADD COLUMN IF NOT EXISTS external_updated_at timestamptz,          -- pazaryerindeki son değişiklik
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS cargo_provider text,
  ADD COLUMN IF NOT EXISTS cargo_tracking_number text,
  ADD COLUMN IF NOT EXISTS cargo_tracking_url text,
  ADD COLUMN IF NOT EXISTS mp_warning text,                          -- eşleşmeyen ürün / yetersiz stok uyarısı
  ADD COLUMN IF NOT EXISTS mp_warning_ack boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_raw jsonb;                       -- pazaryeri yanıtı (fatura/destek için)

DO $$ BEGIN
  ALTER TABLE public.orders ADD CONSTRAINT orders_channel_chk CHECK (channel IN ('site', 'trendyol', 'hepsiburada'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  -- Site siparişi her zaman bir üyeye bağlı kalır
  ALTER TABLE public.orders ADD CONSTRAINT orders_site_has_user CHECK (channel <> 'site' OR user_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_external_package
  ON public.orders(channel, external_package_id) WHERE external_package_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_channel_created ON public.orders(channel, created_at DESC);

-- 2) order_items: pazaryeri kalemi (ürün eşleşmezse product_id boş kalabilir)
ALTER TABLE public.order_items ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS title text,              -- pazaryerindeki ürün adı (anlık görüntü)
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS external_line_id text,
  ADD COLUMN IF NOT EXISTS external_status text,
  ADD COLUMN IF NOT EXISTS stock_applied_at timestamptz,   -- stok bu kalem için düşüldü
  ADD COLUMN IF NOT EXISTS stock_restored_at timestamptz;  -- stok bu kalem için geri eklendi
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_items_external_line
  ON public.order_items(order_id, external_line_id) WHERE external_line_id IS NOT NULL;

-- 3) Kanal ayarları (anon/authenticated'a kapalı kalır)
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS trendyol_orders_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trendyol_orders_since timestamptz,      -- bu andan ÖNCEKİ siparişler alınmaz
  ADD COLUMN IF NOT EXISTS hepsiburada_orders_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hepsiburada_orders_since timestamptz;

-- 4) Sipariş çekme durumu (kanal başına)
CREATE TABLE IF NOT EXISTS public.marketplace_order_sync (
  channel text PRIMARY KEY,
  cursor_at timestamptz,           -- en son işlenen pazaryeri değişiklik zamanı
  last_run_at timestamptz,
  last_ok_at timestamptz,
  last_error text,
  imported_total int NOT NULL DEFAULT 0,
  updated_total int NOT NULL DEFAULT 0
);
ALTER TABLE public.marketplace_order_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_order_sync FROM anon, authenticated;
GRANT ALL ON public.marketplace_order_sync TO service_role;

-- 5) Kalem bazında stok düş (tek seferlik). Ürün eşleşmediyse hiçbir şey yapmaz.
--    Stok yetersizse 0'a sabitler ve "shortage" döner (fazla satış uyarısı için).
CREATE OR REPLACE FUNCTION public.mp_apply_item_stock(p_item_id uuid, p_source text DEFAULT 'marketplace_order')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  it record;
  v_cur int;
BEGIN
  SELECT * INTO it FROM order_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF it.stock_applied_at IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF it.variant_id IS NULL AND it.product_id IS NULL THEN RETURN jsonb_build_object('ok', true, 'unmatched', true); END IF;

  IF it.variant_id IS NOT NULL THEN
    SELECT stock INTO v_cur FROM product_variants WHERE id = it.variant_id FOR UPDATE;
    UPDATE product_variants SET stock = GREATEST(COALESCE(stock, 0) - it.quantity, 0) WHERE id = it.variant_id;
  ELSE
    SELECT stock INTO v_cur FROM products WHERE id = it.product_id FOR UPDATE;
    UPDATE products SET stock = GREATEST(COALESCE(stock, 0) - it.quantity, 0) WHERE id = it.product_id;
  END IF;
  v_cur := COALESCE(v_cur, 0);

  UPDATE order_items SET stock_applied_at = now() WHERE id = p_item_id;
  INSERT INTO stock_events (product_id, variant_id, old_stock, new_stock, delta, source)
  VALUES (it.product_id, it.variant_id, v_cur, GREATEST(v_cur - it.quantity, 0), -LEAST(it.quantity, v_cur), p_source);

  RETURN jsonb_build_object('ok', true, 'shortage', v_cur < it.quantity, 'available', v_cur, 'needed', it.quantity);
END;
$$;

-- 6) Kalem bazında stok iade (tek seferlik; yalnız düşülmüş ve henüz iade edilmemişse)
CREATE OR REPLACE FUNCTION public.mp_restore_item_stock(p_item_id uuid, p_source text DEFAULT 'marketplace_cancel')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  it record;
  v_cur int;
BEGIN
  SELECT * INTO it FROM order_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF it.stock_applied_at IS NULL OR it.stock_restored_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'noop', true);
  END IF;

  IF it.variant_id IS NOT NULL THEN
    SELECT stock INTO v_cur FROM product_variants WHERE id = it.variant_id FOR UPDATE;
    UPDATE product_variants SET stock = COALESCE(stock, 0) + it.quantity WHERE id = it.variant_id;
  ELSE
    SELECT stock INTO v_cur FROM products WHERE id = it.product_id FOR UPDATE;
    UPDATE products SET stock = COALESCE(stock, 0) + it.quantity WHERE id = it.product_id;
  END IF;
  v_cur := COALESCE(v_cur, 0);

  UPDATE order_items SET stock_restored_at = now() WHERE id = p_item_id;
  INSERT INTO stock_events (product_id, variant_id, old_stock, new_stock, delta, source)
  VALUES (it.product_id, it.variant_id, v_cur, v_cur + it.quantity, it.quantity, p_source);

  RETURN jsonb_build_object('ok', true, 'restored', it.quantity);
END;
$$;

REVOKE ALL ON FUNCTION public.mp_apply_item_stock(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mp_restore_item_stock(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mp_apply_item_stock(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mp_restore_item_stock(uuid, text) TO service_role;
