-- ─────────────────────────────────────────────────────────────────────────────
-- Aşama 1: Stok düşümü + oversell (fazla satış) guard
--
-- Şu ana kadar sipariş tamamlanınca stok HİÇ düşmüyordu → sınırsız fazla satış
-- mümkündü. Bu migration, siparişin gerçek ürün/varyant stoğunu ATOMİK olarak
-- düşen (ve iptal/iade'de geri yükleyen) fonksiyonları ekler.
--
-- Kullanım:
--   • Havale (orders/create): reduce_order_stock(order_id, strict := true)
--       → stok yetmezse EXCEPTION fırlatır, sipariş reddedilir (para alınmadan).
--   • iyzico (callback, ödeme başarılı): reduce_order_stock(order_id, strict := false)
--       → para çekildiği için asla reddetmez; eksik kalırsa 'shortages' döner,
--         stok 0'a sabitlenir, admin bilgilendirilir.
--   • İptal / tam iade: restore_order_stock(order_id) → düşülen stoğu geri ekler.
--
-- İki kez çağrılmaya karşı korumalı: orders.stock_reduced_at doluysa tekrar düşmez;
-- boşsa geri-yükleme no-op'tur.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stock_reduced_at timestamptz;

-- ── Stok düş ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reduce_order_stock(p_order_id uuid, p_strict boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it        record;
  v_cur     integer;
  v_short   jsonb := '[]'::jsonb;
BEGIN
  -- Zaten düşülmüşse tekrar düşme (idempotent)
  IF (SELECT stock_reduced_at FROM orders WHERE id = p_order_id) IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  FOR it IN
    SELECT oi.product_id, oi.variant_id, oi.quantity, oi.unit_price,
           COALESCE(p.title, '') AS title
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = p_order_id
  LOOP
    -- Satırı kilitle (eşzamanlı siparişlerde yarış koşulunu önler)
    IF it.variant_id IS NOT NULL THEN
      SELECT stock INTO v_cur FROM product_variants WHERE id = it.variant_id FOR UPDATE;
    ELSE
      SELECT stock INTO v_cur FROM products WHERE id = it.product_id FOR UPDATE;
    END IF;

    v_cur := COALESCE(v_cur, 0);

    IF v_cur < it.quantity THEN
      -- unit_price = 0 → ücretsiz hediye. Hediye stoğu bitse bile ödemeli siparişi
      -- BLOKLAMA (strict modda bile); sadece raporla ve stoğu 0'a çek.
      IF p_strict AND COALESCE(it.unit_price, 0) > 0 THEN
        -- Havale: para alınmadan reddet → tüm işlem geri sarılır
        RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', COALESCE(NULLIF(it.title, ''), it.product_id::text)
          USING ERRCODE = 'P0001';
      ELSE
        -- Ödeme alınmış: reddetme, eksiği rapor et, stoğu 0'a sabitle
        v_short := v_short || jsonb_build_object(
          'product_id', it.product_id,
          'variant_id', it.variant_id,
          'title',      it.title,
          'needed',     it.quantity,
          'available',  v_cur
        );
      END IF;
    END IF;

    IF it.variant_id IS NOT NULL THEN
      UPDATE product_variants SET stock = GREATEST(stock - it.quantity, 0) WHERE id = it.variant_id;
    ELSE
      UPDATE products SET stock = GREATEST(stock - it.quantity, 0) WHERE id = it.product_id;
    END IF;
  END LOOP;

  UPDATE orders SET stock_reduced_at = now() WHERE id = p_order_id;
  RETURN jsonb_build_object('ok', true, 'shortages', v_short);
END;
$$;

-- ── Stok geri yükle (iptal / tam iade) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.restore_order_stock(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it record;
BEGIN
  -- Hiç düşülmemişse yapacak bir şey yok
  IF (SELECT stock_reduced_at FROM orders WHERE id = p_order_id) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'noop', true);
  END IF;

  FOR it IN
    SELECT product_id, variant_id, quantity FROM order_items WHERE order_id = p_order_id
  LOOP
    IF it.variant_id IS NOT NULL THEN
      UPDATE product_variants SET stock = stock + it.quantity WHERE id = it.variant_id;
    ELSE
      UPDATE products SET stock = stock + it.quantity WHERE id = it.product_id;
    END IF;
  END LOOP;

  UPDATE orders SET stock_reduced_at = NULL WHERE id = p_order_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Anon/authenticated bu fonksiyonları doğrudan çağıramasın; yalnızca service_role
-- (sunucu tarafı admin client) ve RPC güvenli çağrılar. RLS'ten bağımsız çalışması
-- için SECURITY DEFINER kullanıldı.
REVOKE ALL ON FUNCTION public.reduce_order_stock(uuid, boolean) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_order_stock(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reduce_order_stock(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_order_stock(uuid) TO service_role;
