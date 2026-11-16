-- ÜYE YAZMA İZİNLERİ SIKILAŞTIRMA (güvenlik taraması 2026-11-16, 5. parça bulgu 1–4). Tekrar çalıştırmak güvenli.
--
-- 1) apply_price_changes / rematch_order_items: yönetici kontrolü "current_user postgres değilse" diyordu. Fonksiyon
--    SECURITY DEFINER olduğundan içeride current_user HER ZAMAN sahibi (postgres) → kontrol hiç reddetmiyordu; giriş
--    yapmış her üye tarayıcıdan fiyat değiştirebiliyordu (1 TL yap → sipariş ver). Artık: yönetici YA DA güvenilen
--    çağıran (service_role anahtarı ya da API dışından doğrudan veritabanı bağlantısı — psql / migration).
-- 2) affiliate_profiles: "kullanıcı kendi satış ortaklığı profilini oluşturabilir" kuralı üyenin tarayıcıdan kendi
--    kaydını İSTEDİĞİ kredi bakiyesi / komisyon oranıyla eklemesine izin veriyordu (ödeme sayfası bu krediyi harcıyor →
--    bedava sipariş). Başvuru zaten sunucudan (/api/affiliate/apply, service_role) açılıyor → kural kaldırılır.
-- 3) order_reviews: üye kendi yorumlarında HER ŞEYİ yapabiliyordu ("onaylı" dahil, sipariş başkasınınki olsa bile) →
--    sahte onaylı 5 yıldız ürün sayfasında. Artık üye: kendi yorumlarını okur; yalnız KENDİ siparişine, ONAYSIZ ve
--    yönetici notu boş yorum ekler (Hesabım › Yorum yap). Değiştirme / silme yok (onaydan sonra metin değiştirilemez).

-- Güvenilen çağıran: service_role anahtarı ya da API (PostgREST "authenticator") dışından doğrudan bağlantı.
-- session_user SECURITY DEFINER'dan etkilenmez (current_user etkilenir — eski hatanın nedeni).
CREATE OR REPLACE FUNCTION public.trusted_db_caller()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(auth.role(), '') = 'service_role' OR session_user <> 'authenticator'
$$;

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
  IF NOT (public.is_admin() OR public.trusted_db_caller()) THEN
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

CREATE OR REPLACE FUNCTION public.rematch_order_items()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT (public.is_admin() OR public.trusted_db_caller()) THEN
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

-- 2) Satış ortaklığı profili tarayıcıdan eklenemez
DROP POLICY IF EXISTS "Kullanıcılar kendi affiliate profilini oluşturabilir" ON public.affiliate_profiles;
REVOKE INSERT, DELETE ON public.affiliate_profiles FROM anon, authenticated;

-- 3) Yorum: üye okur + yalnız kendi siparişine onaysız ekler
DROP POLICY IF EXISTS "user_own_reviews" ON public.order_reviews;
DROP POLICY IF EXISTS "user_read_own_reviews" ON public.order_reviews;
DROP POLICY IF EXISTS "user_insert_own_review" ON public.order_reviews;
CREATE POLICY "user_read_own_reviews" ON public.order_reviews
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_insert_own_review" ON public.order_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND is_approved = false
    AND admin_note IS NULL
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid())
  );
