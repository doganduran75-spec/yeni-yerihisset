-- ============================================================
-- SİPARİŞ İPTAL / İADE AKIŞI (senaryo + aksiyon + statü matrisi, 2026-10-05)
-- ============================================================
-- Durum değerleri:
--   ödeme  : pending (Bekleniyor) · paid (Ödendi) · failed (Alınmadı) · partial_refund (Kısmi iade) · refunded (İade edildi)
--   kargo  : waiting · preparing · shipped · delivered · undelivered · returned (İade geldi) · cancelled
--   fatura : pending · invoiced · return_invoiced (İade faturası kesildi) · not_required (Gerekmiyor)
-- İşlemler (sipariş detayındaki düğmeler; sunucu /api/admin/orders/action):
--   order_record_refund   : ücret iadesi (tutar + yöntem) → ödeme Kısmi iade / İade edildi, iade tutarı, geçmiş notu
--   order_mark_cancelled  : kargodan ÖNCE iptal → stok geri, kargo İptal, fatura Gerekmiyor (kesilmediyse)
--   order_receive_return  : kargodan SONRA iade geldi → seçilen ürünler (kusursuzsa) stoğa, kargo İade geldi
-- Para iadesi STOĞA DOKUNMAZ; stok yalnız ürün depoya dönünce (iptalde otomatik, iadede seçime göre).
-- Ciro (her yerde): iptal edilmemiş + ödemesi alınmış (paid / partial_refund / refunded) → tutar − iade.
-- Süreç "Kapandı" otomatik DEĞİL (elle).

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS returned_qty int NOT NULL DEFAULT 0;   -- iade gelen adet
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS restocked_qty int NOT NULL DEFAULT 0;  -- stoğa geri eklenen adet

-- İptalde stok iadesi: iade sırasında zaten stoğa eklenenleri tekrar ekleme
CREATE OR REPLACE FUNCTION public.restore_order_stock(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it record; q int;
BEGIN
  IF (SELECT stock_reduced_at FROM public.orders WHERE id = p_order_id) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'noop', true);
  END IF;
  FOR it IN SELECT id, product_id, variant_id, quantity, restocked_qty FROM public.order_items WHERE order_id = p_order_id LOOP
    q := it.quantity - coalesce(it.restocked_qty, 0);
    CONTINUE WHEN q <= 0;
    IF it.variant_id IS NOT NULL THEN
      UPDATE public.product_variants SET stock = stock + q WHERE id = it.variant_id;
    ELSE
      UPDATE public.products SET stock = stock + q WHERE id = it.product_id;
    END IF;
    UPDATE public.order_items SET restocked_qty = quantity WHERE id = it.id;
  END LOOP;
  UPDATE public.orders SET stock_reduced_at = NULL WHERE id = p_order_id;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.restore_order_stock(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_order_stock(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.refund_method_label(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p WHEN 'iyzico' THEN 'iyzico' WHEN 'bank_transfer' THEN 'Havale/EFT' WHEN 'cash' THEN 'Kapıda / nakit'
                WHEN 'marketplace' THEN 'Pazaryeri' ELSE coalesce(nullif(p, ''), 'Diğer') END
$$;

-- 1) Ücret iadesi
CREATE OR REPLACE FUNCTION public.order_record_refund(p_order uuid, p_amount numeric, p_method text, p_note text DEFAULT NULL, p_actor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE o record; remaining numeric; newref numeric; is_full boolean;
BEGIN
  IF NOT (public.is_admin() OR coalesce(auth.role(), '') = 'service_role') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = p_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF coalesce(o.payment_status, 'pending') NOT IN ('paid', 'partial_refund') THEN
    RAISE EXCEPTION 'Ödemesi alınmamış siparişe ücret iadesi girilemez';
  END IF;
  remaining := round(o.total_amount - coalesce(o.refunded_amount, 0), 2);
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > remaining + 0.005 THEN
    RAISE EXCEPTION 'İade tutarı 0 ile % TL arasında olmalı', remaining;
  END IF;
  newref := round(coalesce(o.refunded_amount, 0) + p_amount, 2);
  is_full := newref >= o.total_amount - 0.005;
  UPDATE public.orders SET
    refunded_amount = newref,
    refund_status = CASE WHEN is_full THEN 'full' ELSE 'partial' END,
    payment_status = CASE WHEN is_full THEN 'refunded' ELSE 'partial_refund' END,
    status = CASE WHEN is_full AND status <> 'cancelled' THEN 'refunded' ELSE status END,
    refund_method = coalesce(nullif(p_method, ''), refund_method)
  WHERE id = p_order;
  INSERT INTO public.order_events (order_id, type, note, created_by)
  VALUES (p_order, 'refund',
          format('%s TL ücret iadesi (%s)%s', replace(to_char(p_amount, 'FM9999999990.00'), '.', ','),
                 public.refund_method_label(p_method), CASE WHEN coalesce(p_note, '') <> '' THEN ' — ' || p_note ELSE '' END),
          CASE WHEN EXISTS (SELECT 1 FROM auth.users WHERE id = p_actor) THEN p_actor END);
  RETURN jsonb_build_object('refunded_amount', newref, 'full', is_full);
END $$;

-- 2) Kargodan önce iptal (ödeme alınmışsa önce ücret iadesi yapılmış olmalı)
CREATE OR REPLACE FUNCTION public.order_mark_cancelled(p_order uuid, p_note text DEFAULT NULL, p_actor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE o record; inv text;
BEGIN
  IF NOT (public.is_admin() OR coalesce(auth.role(), '') = 'service_role') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = p_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF o.status = 'cancelled' THEN RAISE EXCEPTION 'Sipariş zaten iptal edilmiş'; END IF;
  IF coalesce(o.channel, 'site') <> 'site' AND o.import_source IS NULL THEN
    RAISE EXCEPTION 'Pazaryeri siparişi pazaryerinden iptal edilir';
  END IF;
  IF coalesce(o.shipment_status, 'waiting') IN ('shipped', 'delivered', 'undelivered', 'returned') THEN
    RAISE EXCEPTION 'Kargolanmış sipariş iptal edilemez — "İade al" kullanın';
  END IF;
  IF coalesce(o.payment_status, 'pending') IN ('paid', 'partial_refund') THEN
    RAISE EXCEPTION 'Ödemesi alınmış sipariş: önce ücret iadesi yapılmalı';
  END IF;

  PERFORM public.restore_order_stock(p_order);
  inv := CASE WHEN coalesce(o.invoice_status, 'pending') = 'pending' THEN 'not_required' ELSE o.invoice_status END;
  UPDATE public.orders SET
    status = 'cancelled',
    shipment_status = 'cancelled',
    payment_status = CASE WHEN coalesce(payment_status, 'pending') = 'pending' THEN 'failed' ELSE payment_status END,
    invoice_status = inv
  WHERE id = p_order;
  INSERT INTO public.order_events (order_id, type, note, created_by)
  VALUES (p_order, 'note', 'Sipariş iptal edildi' || CASE WHEN coalesce(p_note, '') <> '' THEN ' — ' || p_note ELSE '' END
                 || CASE WHEN inv = 'invoiced' THEN ' (fatura kesilmişti: iade faturası gerekli)' ELSE '' END,
          CASE WHEN EXISTS (SELECT 1 FROM auth.users WHERE id = p_actor) THEN p_actor END);
  RETURN jsonb_build_object('ok', true, 'needs_return_invoice', inv = 'invoiced');
END $$;

-- 3) Kargodan sonra iade geldi: seçilen ürünler (ürün sağlamsa) stoğa
--    p_items: [{item_id, qty, restock}]
CREATE OR REPLACE FUNCTION public.order_receive_return(p_order uuid, p_items jsonb, p_note text DEFAULT NULL, p_actor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE o record; it record; oi record; q int; old_s int; lines text[] := '{}'; n_restocked int := 0; all_back boolean;
BEGIN
  IF NOT (public.is_admin() OR coalesce(auth.role(), '') = 'service_role') THEN RAISE EXCEPTION 'Yetkisiz'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = p_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sipariş bulunamadı'; END IF;
  IF coalesce(o.shipment_status, 'waiting') NOT IN ('shipped', 'delivered', 'undelivered', 'returned') THEN
    RAISE EXCEPTION 'Henüz kargolanmamış sipariş için "Siparişi iptal et" kullanın';
  END IF;

  FOR it IN SELECT * FROM jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) AS x(item_id uuid, qty int, restock boolean) LOOP
    SELECT * INTO oi FROM public.order_items WHERE id = it.item_id AND order_id = p_order FOR UPDATE;
    CONTINUE WHEN NOT FOUND;
    q := least(coalesce(it.qty, 0), oi.quantity - coalesce(oi.returned_qty, 0));
    CONTINUE WHEN q <= 0;
    UPDATE public.order_items SET returned_qty = coalesce(returned_qty, 0) + q,
           restocked_qty = coalesce(restocked_qty, 0) + CASE WHEN coalesce(it.restock, false) THEN q ELSE 0 END
     WHERE id = oi.id;
    IF coalesce(it.restock, false) THEN
      IF oi.variant_id IS NOT NULL THEN
        SELECT stock INTO old_s FROM public.product_variants WHERE id = oi.variant_id FOR UPDATE;
        UPDATE public.product_variants SET stock = coalesce(stock, 0) + q WHERE id = oi.variant_id;
        INSERT INTO public.stock_events (product_id, variant_id, old_stock, new_stock, delta, source, changed_by)
        VALUES (oi.product_id, oi.variant_id, old_s, coalesce(old_s, 0) + q, q, 'order_return',
                CASE WHEN EXISTS (SELECT 1 FROM auth.users WHERE id = p_actor) THEN p_actor END);
      ELSIF oi.product_id IS NOT NULL THEN
        UPDATE public.products SET stock = coalesce(stock, 0) + q WHERE id = oi.product_id;
      END IF;
      n_restocked := n_restocked + q;
    END IF;
    lines := lines || format('%s × %s%s', q,
               coalesce(nullif(oi.title, ''), nullif(oi.variant_name, ''), oi.sku, 'ürün')
               || CASE WHEN coalesce(oi.variant_name, '') <> '' AND coalesce(oi.title, '') <> '' THEN ' (' || oi.variant_name || ')' ELSE '' END,
               CASE WHEN coalesce(it.restock, false) THEN ' — stoğa eklendi' ELSE ' — stoğa EKLENMEDİ' END);
  END LOOP;
  IF array_length(lines, 1) IS NULL THEN RAISE EXCEPTION 'İade gelen ürün seçilmedi'; END IF;

  all_back := NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = p_order AND coalesce(returned_qty, 0) < quantity);
  UPDATE public.orders SET shipment_status = CASE WHEN all_back THEN 'returned' ELSE shipment_status END WHERE id = p_order;
  INSERT INTO public.order_events (order_id, type, note, created_by)
  VALUES (p_order, 'return_received',
          CASE WHEN all_back THEN 'İade geldi (tümü): ' ELSE 'İade geldi (kısmi): ' END || array_to_string(lines, ', ')
          || CASE WHEN coalesce(p_note, '') <> '' THEN ' — ' || p_note ELSE '' END,
          CASE WHEN EXISTS (SELECT 1 FROM auth.users WHERE id = p_actor) THEN p_actor END);
  RETURN jsonb_build_object('all_returned', all_back, 'restocked', n_restocked);
END $$;

REVOKE ALL ON FUNCTION public.order_record_refund(uuid, numeric, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.order_mark_cancelled(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.order_receive_return(uuid, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_record_refund(uuid, numeric, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.order_mark_cancelled(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.order_receive_return(uuid, jsonb, text, uuid) TO service_role;

-- 4) Müşteri / Müdavim rolleri: kısmi iadeli sipariş de "ödenmiş" sayılır (tam iade sayılmaz)
CREATE OR REPLACE FUNCTION public.refresh_member_auto_tags(p_user_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_role uuid;
  v_size_group text;
  n_roles int := 0;
  n_tags int := 0;
  v_mud uuid;
  v_min int;
  n_mud int := 0;
BEGIN
  SELECT id INTO v_role FROM public.roles WHERE slug = 'musteri' LIMIT 1;
  SELECT id INTO v_mud FROM public.roles WHERE slug = 'mudavim' LIMIT 1;
  SELECT coalesce((SELECT mudavim_min_orders FROM public.settings LIMIT 1), 2) INTO v_min;
  SELECT name INTO v_size_group FROM public.variant_groups WHERE lower(name) LIKE 'numara%' ORDER BY length(name) LIMIT 1;
  v_size_group := coalesce(v_size_group, 'Numara');

  -- 1) Müşteri rolü
  IF v_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    SELECT DISTINCT o.user_id, v_role
    FROM public.orders o
    WHERE o.user_id IS NOT NULL AND o.payment_status IN ('paid', 'partial_refund') AND o.status <> 'cancelled'
      AND (p_user_ids IS NULL OR o.user_id = ANY (p_user_ids))
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = o.user_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
    GET DIAGNOSTICS n_roles = ROW_COUNT;
  END IF;

  -- 1b) Müdavim: en az N ödenmiş, iptal edilmemiş sipariş (N = settings.mudavim_min_orders, varsayılan 2)
  IF v_mud IS NOT NULL AND v_min >= 2 THEN
    INSERT INTO public.user_roles (user_id, role_id)
    SELECT o.user_id, v_mud
    FROM public.orders o
    WHERE o.user_id IS NOT NULL AND o.payment_status IN ('paid', 'partial_refund') AND o.status <> 'cancelled'
      AND (p_user_ids IS NULL OR o.user_id = ANY (p_user_ids))
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = o.user_id)
    GROUP BY o.user_id
    HAVING count(*) >= v_min
    ON CONFLICT (user_id, role_id) DO NOTHING;
    GET DIAGNOSTICS n_mud = ROW_COUNT;
  END IF;

  -- 2) Etiket adayları (aynı işlemde birden fazla çağrılabilir → önce sil)
  DROP TABLE IF EXISTS _auto_tag_e;
  CREATE TEMP TABLE _auto_tag_e ON COMMIT DROP AS
  WITH it AS (
    SELECT o.user_id, oi.product_id, oi.variant_id, oi.title, oi.size_label
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.user_id IS NOT NULL AND o.payment_status IN ('paid', 'partial_refund') AND o.status <> 'cancelled'
      AND (p_user_ids IS NULL OR o.user_id = ANY (p_user_ids))
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = o.user_id)
  )
  SELECT DISTINCT user_id, g, v FROM (
    SELECT it.user_id, 'Kategori'::text AS g, c.name AS v
      FROM it JOIN public.products pr ON pr.id = it.product_id JOIN public.categories c ON c.id = pr.category_id
    UNION ALL
    SELECT it.user_id, 'Marka', b.name
      FROM it JOIN public.products pr ON pr.id = it.product_id JOIN public.brands b ON b.id = pr.brand_id
    UNION ALL
    SELECT it.user_id, 'Marka', b.name
      FROM it JOIN public.brands b
        ON it.product_id IS NULL AND length(b.name) >= 3
       AND lower(coalesce(it.title, '')) LIKE lower(b.name) || ' %'
    UNION ALL
    SELECT it.user_id, vg.name, vo.value
      FROM it JOIN public.product_variants pv ON pv.id = it.variant_id
              JOIN public.variant_options vo ON vo.id = pv.variant_option_id
              JOIN public.variant_groups vg ON vg.id = vo.group_id
    UNION ALL
    SELECT it.user_id, v_size_group, trim(it.size_label)
      FROM it WHERE it.variant_id IS NULL AND coalesce(trim(it.size_label), '') <> ''
  ) x
  WHERE coalesce(trim(v), '') <> '';

  INSERT INTO public.member_tag_groups (name)
  SELECT DISTINCT g FROM _auto_tag_e ON CONFLICT (name) DO NOTHING;

  INSERT INTO public.member_tag_options (group_id, value)
  SELECT DISTINCT mg.id, e.v FROM _auto_tag_e e JOIN public.member_tag_groups mg ON mg.name = e.g
  ON CONFLICT (group_id, value) DO NOTHING;

  INSERT INTO public.user_tags (user_id, tag_option_id)
  SELECT DISTINCT e.user_id, mo.id
  FROM _auto_tag_e e
  JOIN public.member_tag_groups mg ON mg.name = e.g
  JOIN public.member_tag_options mo ON mo.group_id = mg.id AND mo.value = e.v
  ON CONFLICT (user_id, tag_option_id) DO NOTHING;
  GET DIAGNOSTICS n_tags = ROW_COUNT;

  DROP TABLE IF EXISTS _auto_tag_e;
  RETURN jsonb_build_object('roles_added', n_roles, 'mudavim_added', n_mud, 'tags_added', n_tags);
END $$;
REVOKE ALL ON FUNCTION public.refresh_member_auto_tags(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_member_auto_tags(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_orders_member_auto_tags()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.payment_status IN ('paid', 'partial_refund') AND NEW.status <> 'cancelled'
     AND (TG_OP = 'INSERT'
          OR OLD.payment_status IS DISTINCT FROM NEW.payment_status
          OR OLD.status IS DISTINCT FROM NEW.status
          OR OLD.user_id IS DISTINCT FROM NEW.user_id) THEN
    PERFORM public.refresh_member_auto_tags(ARRAY[NEW.user_id]);
  END IF;
  RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.trg_order_items_member_auto_tags()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
  SELECT o.user_id INTO v_user FROM public.orders o
  WHERE o.id = NEW.order_id AND o.user_id IS NOT NULL AND o.payment_status IN ('paid', 'partial_refund') AND o.status <> 'cancelled';
  IF v_user IS NOT NULL THEN
    PERFORM public.refresh_member_auto_tags(ARRAY[v_user]);
  END IF;
  RETURN NULL;
END $$;

-- 5) Mevcut verinin yeni kurala geçmesi
-- Eski site / iyzico: iade tutarı kayıtlı ama ödeme "Ödendi" görünenler
UPDATE public.orders SET payment_status = 'refunded'
 WHERE refund_status = 'full' AND coalesce(payment_status, '') <> 'refunded';
UPDATE public.orders SET payment_status = 'partial_refund'
 WHERE refund_status = 'partial' AND coalesce(payment_status, '') NOT IN ('partial_refund', 'refunded');
-- Pazaryeri: iadesi tamamlanan (Returned) → İade edildi, ciroda 0
UPDATE public.orders SET payment_status = 'refunded', refund_status = 'full', refunded_amount = total_amount, refund_method = 'marketplace'
 WHERE coalesce(channel, 'site') <> 'site' AND import_source IS NULL AND status = 'refunded' AND coalesce(payment_status, '') <> 'refunded';
-- Pazaryeri: iptal edilen → ödeme alınmadı
UPDATE public.orders SET payment_status = 'failed'
 WHERE coalesce(channel, 'site') <> 'site' AND import_source IS NULL AND status = 'cancelled' AND payment_status = 'paid';
-- İptal edilmiş ve faturası kesilmemiş → fatura gerekmiyor
UPDATE public.orders SET invoice_status = 'not_required'
 WHERE status = 'cancelled' AND coalesce(invoice_status, 'pending') = 'pending';

SELECT payment_status, invoice_status, count(*) AS siparis
FROM public.orders GROUP BY 1, 2 ORDER BY 1, 2;
