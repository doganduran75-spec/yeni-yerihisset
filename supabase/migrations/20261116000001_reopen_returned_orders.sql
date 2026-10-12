-- Kapalı aktarılmış siparişlere yeni sistemde iade / para iadesi işlenmişse yeniden aç (2026-10-12): pano yalnız
-- açık siparişleri sayıyordu → "İade faturası kesilecek" adımı görünmüyordu. Eski sitedeki iadeler "Ödendi" durumuyla
-- aktarıldığından (woo-import) yalnız yeni sistemde işlenen iadeler (ödeme: iade edildi / kısmi iade) etkilenir.
UPDATE public.orders
SET is_closed = false, closed_at = NULL
WHERE is_closed
  AND payment_status IN ('refunded', 'partial_refund')
  AND invoice_status = 'invoiced';
