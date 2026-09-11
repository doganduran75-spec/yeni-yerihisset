-- Sipariş "tekrar oluştur" (ödeme yarıda kaldı → kurtarma) altyapısı.
-- 1) auto_expired: sipariş cron tarafından mı otomatik iptal edildi (havale 24s /
--    kart 30dk). Sadece bunlarda müşteriye "tekrar oluştur" butonu + kurtarma
--    e-postası gösterilir; admin'in elle/iade iptallerinde gösterilmez.
-- 2) expire_unpaid_orders artık iptal edilen sipariş ID'lerini de döndürür ki
--    cron route kurtarma e-postalarını kuyruğa atabilsin.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS auto_expired boolean NOT NULL DEFAULT false;

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
  ids         uuid[] := '{}';
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
      SET status = 'cancelled', payment_status = 'failed', stock_reduced_at = NULL, auto_expired = true
      WHERE id = o.id;

    INSERT INTO order_events (order_id, type, note)
      VALUES (o.id, 'note', 'Otomatik iptal: ödeme süresi doldu (stok iade edildi)');

    ids := array_append(ids, o.id);
    n_cancelled := n_cancelled + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'cancelled', n_cancelled, 'ids', to_jsonb(ids));
END;
$$;

REVOKE ALL ON FUNCTION public.expire_unpaid_orders() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_orders() TO service_role;
