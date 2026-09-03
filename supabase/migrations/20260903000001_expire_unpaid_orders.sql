-- ─────────────────────────────────────────────────────────────────────────────
-- F9: Ödenmemiş siparişleri otomatik iptal + stok iade
--
-- Model: sepete atınca REZERVE ETME. Rezervasyon yalnızca sipariş verilince
-- (stok o an düşer) başlar ve ödeme gelmezse süre dolunca serbest kalır:
--   • Havale (bank_transfer): 24 saat
--   • Kart (iyzico) terk edilmiş: 30 dakika
--
-- Bir dış zamanlayıcı (cron) /api/cron/expire-orders'ı çağırır; o da bunu çalıştırır.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.expire_unpaid_orders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o           record;
  it          record;
  n_cancelled integer := 0;
BEGIN
  FOR o IN
    SELECT id FROM orders
    WHERE stock_reduced_at IS NOT NULL
      AND is_closed = false
      AND status NOT IN ('cancelled', 'refunded')
      AND payment_status = 'pending'
      AND (
        (payment_method = 'bank_transfer' AND created_at < now() - interval '24 hours')
        OR (payment_method = 'iyzico'      AND created_at < now() - interval '30 minutes')
      )
  LOOP
    -- Stoğu geri yükle
    FOR it IN SELECT product_id, variant_id, quantity FROM order_items WHERE order_id = o.id LOOP
      IF it.variant_id IS NOT NULL THEN
        UPDATE product_variants SET stock = stock + it.quantity WHERE id = it.variant_id;
      ELSE
        UPDATE products SET stock = stock + it.quantity WHERE id = it.product_id;
      END IF;
    END LOOP;

    UPDATE orders
      SET status = 'cancelled', payment_status = 'failed', stock_reduced_at = NULL
      WHERE id = o.id;

    INSERT INTO order_events (order_id, type, note)
      VALUES (o.id, 'note', 'Otomatik iptal: ödeme süresi doldu (stok iade edildi)');

    n_cancelled := n_cancelled + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'cancelled', n_cancelled);
END;
$$;

REVOKE ALL ON FUNCTION public.expire_unpaid_orders() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_orders() TO service_role;
