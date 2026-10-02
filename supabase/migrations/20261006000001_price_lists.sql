-- FİYAT YÖNETİMİ: fiyat listeleri + kalem fiyatları + fiyat geçmişi.
-- Kullanıcı kararı (2026-10-02): fiyatlar ürün sayfasından KALKAR, ayrı "Fiyatlar" sayfasında
-- yönetilir; kanal/ülke başına liste (Site, Trendyol, Hepsiburada, ileride yurtdışı…).
-- * Site Satış ve Site PSF listeleri MEVCUT kolonlarda kalır (vitrin/checkout değişmez):
--     site_sale → product_variants.price (varyantsızda products.price)
--     site_list → product_variants.compare_at_price (varyantsızda item_prices)
-- * Diğer listeler item_prices'ta. Trendyol kolonları (trendyol_price/psf) buraya taşınır.
-- * Fiyat değişikliği yalnız apply_price_changes() ile (admin) → geçmiş tutulur.
-- * Fiyatsız (satış fiyatı > 0 olmayan) ürün yayına alınamaz.
-- Tekrar çalıştırmak güvenli.

-- 1) Fiyat listeleri
CREATE TABLE IF NOT EXISTS public.price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,               -- site_sale, site_list, trendyol_sale, …
  name text NOT NULL,
  channel text NOT NULL DEFAULT 'other',   -- site | trendyol | hepsiburada | other
  kind text NOT NULL DEFAULT 'sale',       -- sale (satış) | list (PSF / üstü çizili)
  currency text NOT NULL DEFAULT 'TRY',
  sort_order int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  builtin boolean NOT NULL DEFAULT false,  -- sistem listesi: silinemez, kodu değişmez
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT price_lists_kind_chk CHECK (kind IN ('sale', 'list'))
);

INSERT INTO public.price_lists (code, name, channel, kind, currency, sort_order, builtin) VALUES
  ('site_sale',        'Site Satış',        'site',        'sale', 'TRY', 10, true),
  ('site_list',        'Site PSF',          'site',        'list', 'TRY', 20, true),
  ('trendyol_sale',    'Trendyol Satış',    'trendyol',    'sale', 'TRY', 30, true),
  ('trendyol_list',    'Trendyol PSF',      'trendyol',    'list', 'TRY', 40, true),
  ('hepsiburada_sale', 'Hepsiburada Satış', 'hepsiburada', 'sale', 'TRY', 50, true)
ON CONFLICT (code) DO NOTHING;

-- 2) Kalem fiyatları (site_sale/site_list varyantta mevcut kolonlarda; diğerleri burada)
CREATE TABLE IF NOT EXISTS public.item_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  price_list_id uuid NOT NULL REFERENCES public.price_lists(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_item_prices
  ON public.item_prices(product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid), price_list_id);
CREATE INDEX IF NOT EXISTS idx_item_prices_list ON public.item_prices(price_list_id);

-- 3) Fiyat geçmişi
CREATE TABLE IF NOT EXISTS public.price_history (
  id bigserial PRIMARY KEY,
  product_id uuid,
  variant_id uuid,
  list_code text NOT NULL,
  old_amount numeric(12,2),
  new_amount numeric(12,2),
  source text NOT NULL DEFAULT 'price_page',
  batch_id uuid,                           -- aynı kayıtta yapılan değişiklikler (toplu geri alma için)
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_price_history_created ON public.price_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_item ON public.price_history(variant_id, product_id);

-- RLS: fiyat listeleri herkes okuyabilir (vitrin ileride kullanabilir), yazma yalnız admin;
-- item_prices / price_history yalnız admin.
ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS price_lists_read ON public.price_lists;
CREATE POLICY price_lists_read ON public.price_lists FOR SELECT USING (true);
DROP POLICY IF EXISTS price_lists_admin ON public.price_lists;
CREATE POLICY price_lists_admin ON public.price_lists FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS item_prices_admin ON public.item_prices;
CREATE POLICY item_prices_admin ON public.item_prices FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS price_history_admin_read ON public.price_history;
CREATE POLICY price_history_admin_read ON public.price_history FOR SELECT USING (public.is_admin());
GRANT SELECT ON public.price_lists TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_lists, public.item_prices TO authenticated;
GRANT SELECT ON public.price_history TO authenticated;
GRANT ALL ON public.price_lists, public.item_prices, public.price_history TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.price_history_id_seq TO service_role;

-- 4) Trendyol kolonlarını listelere taşı (yalnız ilk sefer; boş olmayanlar)
INSERT INTO public.item_prices (product_id, variant_id, price_list_id, amount)
SELECT v.product_id, v.id, pl.id, v.trendyol_price
  FROM public.product_variants v, public.price_lists pl
 WHERE pl.code = 'trendyol_sale' AND v.trendyol_price IS NOT NULL AND v.trendyol_price > 0 AND v.product_id IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO public.item_prices (product_id, variant_id, price_list_id, amount)
SELECT v.product_id, v.id, pl.id, v.trendyol_psf
  FROM public.product_variants v, public.price_lists pl
 WHERE pl.code = 'trendyol_list' AND v.trendyol_psf IS NOT NULL AND v.trendyol_psf > 0 AND v.product_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 5) Toplu fiyat kaydetme (yalnız admin). p_changes: [{product_id, variant_id|null, list_code, amount|null}]
--    amount null → o listedeki fiyatı sil (site_sale silinemez/0 olamaz).
CREATE OR REPLACE FUNCTION public.apply_price_changes(p_changes jsonb, p_source text DEFAULT 'price_page')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ch jsonb;
  v_pid uuid; v_vid uuid; v_code text; v_amount numeric; v_old numeric;
  v_list uuid;
  v_batch uuid := gen_random_uuid();
  v_n int := 0;
BEGIN
  IF NOT public.is_admin() AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  FOR ch IN SELECT * FROM jsonb_array_elements(COALESCE(p_changes, '[]'::jsonb)) LOOP
    v_pid := NULLIF(ch->>'product_id', '')::uuid;
    v_vid := NULLIF(ch->>'variant_id', '')::uuid;
    v_code := ch->>'list_code';
    v_amount := CASE WHEN ch->>'amount' IS NULL OR ch->>'amount' = '' THEN NULL ELSE round((ch->>'amount')::numeric, 2) END;
    IF v_pid IS NULL OR v_code IS NULL THEN CONTINUE; END IF;
    IF v_amount IS NOT NULL AND v_amount < 0 THEN RAISE EXCEPTION 'NEGATIVE_PRICE:%', v_code; END IF;

    IF v_code = 'site_sale' THEN
      IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'SITE_PRICE_REQUIRED'; END IF;
      IF v_vid IS NOT NULL THEN
        SELECT price INTO v_old FROM product_variants WHERE id = v_vid AND product_id = v_pid;
        UPDATE product_variants SET price = v_amount WHERE id = v_vid AND product_id = v_pid;
      ELSE
        SELECT price INTO v_old FROM products WHERE id = v_pid;
        UPDATE products SET price = v_amount WHERE id = v_pid;
      END IF;
    ELSIF v_code = 'site_list' AND v_vid IS NOT NULL THEN
      SELECT compare_at_price INTO v_old FROM product_variants WHERE id = v_vid AND product_id = v_pid;
      UPDATE product_variants SET compare_at_price = v_amount WHERE id = v_vid AND product_id = v_pid;
    ELSE
      SELECT id INTO v_list FROM price_lists WHERE code = v_code;
      IF v_list IS NULL THEN RAISE EXCEPTION 'UNKNOWN_PRICE_LIST:%', v_code; END IF;
      SELECT amount INTO v_old FROM item_prices
       WHERE product_id = v_pid AND price_list_id = v_list
         AND COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(v_vid, '00000000-0000-0000-0000-000000000000'::uuid);
      IF v_amount IS NULL THEN
        DELETE FROM item_prices
         WHERE product_id = v_pid AND price_list_id = v_list
           AND COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(v_vid, '00000000-0000-0000-0000-000000000000'::uuid);
      ELSE
        INSERT INTO item_prices (product_id, variant_id, price_list_id, amount, updated_at)
        VALUES (v_pid, v_vid, v_list, v_amount, now())
        ON CONFLICT (product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid), price_list_id)
        DO UPDATE SET amount = EXCLUDED.amount, updated_at = now();
      END IF;
    END IF;

    IF v_old IS DISTINCT FROM v_amount THEN
      INSERT INTO price_history (product_id, variant_id, list_code, old_amount, new_amount, source, batch_id, changed_by)
      VALUES (v_pid, v_vid, v_code, v_old, v_amount, COALESCE(NULLIF(p_source, ''), 'price_page'), v_batch, auth.uid());
      v_n := v_n + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'changed', v_n, 'batch_id', v_batch);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_price_changes(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_price_changes(jsonb, text) TO authenticated, service_role;

-- 6) Fiyatsız ürün yayına alınamaz: aktif ürünün (veya aktif varyantlarından birinin)
--    satış fiyatı > 0 olmalı. Yalnız is_active false→true geçişinde / yeni aktif üründe kontrol.
CREATE OR REPLACE FUNCTION public.require_price_to_activate()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_active IS TRUE AND (TG_OP = 'INSERT' OR OLD.is_active IS DISTINCT FROM TRUE) THEN
    IF COALESCE(NEW.price, 0) <= 0 AND NOT EXISTS (
      SELECT 1 FROM public.product_variants v
       WHERE v.product_id = NEW.id AND COALESCE(v.is_active, true) AND COALESCE(v.price, 0) > 0
    ) THEN
      RAISE EXCEPTION 'PRICE_REQUIRED_TO_ACTIVATE' USING HINT = 'Önce Fiyatlar sayfasından satış fiyatı girin.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_require_price_to_activate ON public.products;
CREATE TRIGGER trg_require_price_to_activate
  BEFORE INSERT OR UPDATE OF is_active ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.require_price_to_activate();
