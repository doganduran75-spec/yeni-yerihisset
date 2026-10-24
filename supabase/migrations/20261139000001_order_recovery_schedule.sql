-- "SİPARİŞİN YARIDA MI KALDI?" HATIRLATMASI (kullanıcı kararları 2026-10-24):
--   * Ödenmeyen sipariş (kart 30 dk / havale 24 saat) yine otomatik iptal olur, stok geri gelir — değişmedi.
--   * Hatırlatma e-postası iptal anında değil, SONRAKİ SABAH 10:00'da (Türkiye) gider (recovery_due_at).
--   * Gönderim anında: müşteri arada başka sipariş verdiyse gönderilmez; ürün tükendiyse "tükendi, alternatiflere
--     bakmak ister misin?" e-postası gider (src/app/api/cron/expire-orders/route.ts).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS recovery_due_at  timestamptz,
  ADD COLUMN IF NOT EXISTS recovery_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS recovery_result  text;   -- sent · sent_alt · skipped_new_order · skipped_no_email
CREATE INDEX IF NOT EXISTS orders_recovery_due_idx ON public.orders (recovery_due_at) WHERE recovery_sent_at IS NULL;

-- Otomatik iptal anında hatırlatma zamanlanır (sonraki sabah 10:00 TR, en az 8 saat sonra). Gönderim: expire-orders cron.
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
  v_due       timestamptz;
BEGIN
  v_due := (date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul') + interval '10 hours') AT TIME ZONE 'Europe/Istanbul';
  WHILE v_due < now() + interval '8 hours' LOOP v_due := v_due + interval '1 day'; END LOOP;

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
      SET status = 'cancelled', payment_status = 'failed', stock_reduced_at = NULL, auto_expired = true,
          recovery_due_at = v_due
      WHERE id = o.id;

    INSERT INTO order_events (order_id, type, note)
      VALUES (o.id, 'note', 'Otomatik iptal: ödeme süresi doldu (stok iade edildi) — hatırlatma ' || to_char(v_due AT TIME ZONE 'Europe/Istanbul', 'DD.MM HH24:MI'));

    ids := array_append(ids, o.id);
    n_cancelled := n_cancelled + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'cancelled', n_cancelled, 'ids', to_jsonb(ids));
END;
$$;

REVOKE ALL ON FUNCTION public.expire_unpaid_orders() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_orders() TO service_role;
