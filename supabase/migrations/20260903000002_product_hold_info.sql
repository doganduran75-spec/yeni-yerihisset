-- ─────────────────────────────────────────────────────────────────────────────
-- F9 alt-özellik: "Yakında dönebilir" bilgisi
--
-- Bir ürün/varyant stok 0 iken, bunun sebebi ödenmemiş bir HAVALE siparişi
-- (24s içinde iptal olabilir) mi, yoksa gerçekten mi tükendi?
-- Bu fonksiyon SADECE {held, free_at} döner — hiçbir müşteri/sipariş bilgisi
-- sızdırmaz. Anon çağırabilir (ürün sayfası).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.product_hold_info(p_product_id uuid, p_variant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT jsonb_build_object(
    'held', COUNT(*) > 0,
    'free_at', MIN(o.created_at + interval '24 hours')
  )
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.product_id = p_product_id
    AND (p_variant_id IS NULL OR oi.variant_id = p_variant_id)
    AND o.payment_method = 'bank_transfer'
    AND o.payment_status = 'pending'
    AND o.status NOT IN ('cancelled', 'refunded')
    AND o.created_at > now() - interval '24 hours';
$$;

REVOKE ALL ON FUNCTION public.product_hold_info(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.product_hold_info(uuid, uuid) TO anon, authenticated, service_role;
