-- MÜŞTERİ İPTALİ — ÜCRET İADESİ BEKLEYEN (kullanıcı kararları 2026-11-12)
-- Müşteri kargoya hazırlanmamış siparişini iptal eder (src/lib/customer-cancel.ts):
--   * Havale, ödeme yapmadım      → anında iptal (order_mark_cancelled)
--   * Havale, "ödeme yaptım" + IBAN:
--       - ödeme sistemde onaylıysa → sipariş iptal (stok geri, kargo İptal) + "Ücret iadesi yap" işi (IBAN talepte)
--       - ödeme henüz onaylanmadıysa → sipariş iptal + "Havale geldiyse iade et" işi (geldi → iade gönderildi / gelmedi → kapat)
--   * Kart → iyzico'dan otomatik iade + iptal; iyzico iadeyi kabul etmezse sipariş yine iptal (stok geri, etiket alınamaz)
--     + "Ücret iadesi yap" işi (yönetici iyzico'dan yeniden dener ya da panelden yapıp işaretler)
-- Açık iş: order_cases kind 'cancel' (status refund_pending | check_transfer). Ücret iadesi tamamlanınca kapanır.

-- 1) Talep türü: iptal + IBAN sahibinin adı
ALTER TABLE public.order_cases DROP CONSTRAINT IF EXISTS order_cases_kind_check;
ALTER TABLE public.order_cases ADD CONSTRAINT order_cases_kind_check CHECK (kind IN ('exchange', 'return', 'cancel'));
ALTER TABLE public.order_cases ADD COLUMN IF NOT EXISTS iban_name text;  -- havale iadesinin alıcı adı (yalnız yönetici görür)

-- 2) Ücret iadesi bekleyen iptal: order_mark_cancelled ile aynı (stok geri, kargo İptal, fatura Gerekmiyor) ama ödemesi
--    alınmış siparişte de çalışır; ödeme durumu "Ödendi" kalır → sipariş ekranı "Ücret iadesi yap" işini gösterir.
--    Ciro etkilenmez (iptal edilen sipariş ciroya girmez). Yalnız sunucu (müşteri iptali) çağırır.
CREATE OR REPLACE FUNCTION public.order_cancel_refund_pending(p_order uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE o record; inv text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = p_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF o.status = 'cancelled' THEN RAISE EXCEPTION 'Sipariş zaten iptal edilmiş'; END IF;
  IF coalesce(o.channel, 'site') <> 'site' AND o.import_source IS NULL THEN
    RAISE EXCEPTION 'Pazaryeri siparişi pazaryerinden iptal edilir';
  END IF;
  IF coalesce(o.shipment_status, 'waiting') IN ('shipped', 'delivered', 'undelivered', 'returned') THEN
    RAISE EXCEPTION 'Kargolanmış sipariş iptal edilemez';
  END IF;

  PERFORM public.restore_order_stock(p_order);
  inv := CASE WHEN coalesce(o.invoice_status, 'pending') = 'pending' THEN 'not_required' ELSE o.invoice_status END;
  UPDATE public.orders SET
    status = 'cancelled',
    shipment_status = 'cancelled',
    payment_status = CASE WHEN coalesce(payment_status, 'pending') = 'pending' THEN 'failed' ELSE payment_status END,
    invoice_status = inv
  WHERE id = p_order;
  INSERT INTO public.order_events (order_id, type, note)
  VALUES (p_order, 'note', 'Sipariş iptal edildi' || CASE WHEN coalesce(p_note, '') <> '' THEN ' — ' || p_note ELSE '' END
                 || CASE WHEN inv = 'invoiced' THEN ' (fatura kesilmişti: iade faturası gerekli)' ELSE '' END);
  RETURN jsonb_build_object('ok', true, 'needs_return_invoice', inv = 'invoiced');
END $$;
REVOKE ALL ON FUNCTION public.order_cancel_refund_pending(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_cancel_refund_pending(uuid, text) TO service_role;
