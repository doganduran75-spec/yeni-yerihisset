-- STOK BEKLEYEN DEĞİŞİM (kullanıcı 2026-11-26): müşteri değişimde stokta olmayan numarayı istedi → talep "stok bekleniyor".
-- O numaraya stok girince (Stok ekranında kaydet, iade gelip stoğa eklenmesi … stoğu ARTIRAN her yol) değişim bekleyen
-- müşteri önceliklidir: sırayla (ilk isteyen önce) her talebe 1 adet ayrılır — alternatif ürün siparişe eklenir, stok 1 düşer,
-- talep "reserved" olur → yöneticiye "Sevk edilecek" işi (Değişim gönderilecek). Pazaryerine kalan stok gider (5 girdi, 1
-- değişime → 4). Müşteriye "stok geldi" e-postası GİTMEZ (değişim bekleyen için stok bildirimi açılmıyor artık); müşteri
-- yalnız kargoya verilince e-posta alır. Kalan stok 0 ise "gelince haber ver" diyenlere de e-posta gitmez (stok ekranı).
-- Tekrar çalıştırmak güvenli.

-- 1 adet ayır: bu numarayı bekleyen değişim talepleri (eski talep önce), stok yettiği kadar
CREATE OR REPLACE FUNCTION public.exchange_reserve_waiting(p_variant uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; x jsonb; arr jsonb; idx int; new_id uuid; n int := 0; v_stock int; changed boolean; still_wait boolean;
BEGIN
  FOR c IN SELECT * FROM order_cases
            WHERE kind = 'exchange' AND status = 'waiting_stock' AND closed_at IS NULL
              AND items @> jsonb_build_array(jsonb_build_object('want_variant_id', p_variant::text, 'wait', true))
            ORDER BY created_at FOR UPDATE SKIP LOCKED LOOP
    arr := c.items; changed := false;
    FOR idx IN 0 .. jsonb_array_length(arr) - 1 LOOP
      x := arr -> idx;
      CONTINUE WHEN (x ->> 'want_variant_id') IS DISTINCT FROM p_variant::text OR coalesce((x ->> 'wait')::boolean, false) = false;
      SELECT stock INTO v_stock FROM product_variants WHERE id = p_variant FOR UPDATE;
      EXIT WHEN coalesce(v_stock, 0) < 1;
      new_id := exchange_add_item(c.order_id, (x ->> 'order_item_id')::uuid, p_variant); -- stok −1 + alternatif kalem
      INSERT INTO stock_events (product_id, variant_id, old_stock, new_stock, delta, source, changed_by)
      SELECT pv.product_id, pv.id, v_stock, v_stock - 1, -1, 'exchange_reserve', auth.uid() FROM product_variants pv WHERE pv.id = p_variant;
      arr := jsonb_set(arr, ARRAY[idx::text], x || jsonb_build_object('wait', false, 'reserved_item_id', new_id));
      changed := true; n := n + 1;
      INSERT INTO order_events (order_id, type, note)
      VALUES (c.order_id, 'note', 'Değişim: istenen numara stoğa girdi — 1 adet bu değişime ayrıldı (stoktan düştü), gönderilecek');
    END LOOP;
    IF changed THEN
      still_wait := EXISTS (SELECT 1 FROM jsonb_array_elements(arr) e WHERE coalesce((e ->> 'wait')::boolean, false));
      UPDATE order_cases SET items = arr, status = CASE WHEN still_wait THEN 'waiting_stock' ELSE 'reserved' END, updated_at = now()
       WHERE id = c.id;
    END IF;
    SELECT stock INTO v_stock FROM product_variants WHERE id = p_variant;
    EXIT WHEN coalesce(v_stock, 0) < 1;
  END LOOP;
  RETURN n;
END $$;

-- Ayrılan (henüz gönderilmemiş) alternatifi geri al: kalem silinir, stok geri eklenir (yönetici başka ürün seçti / talep kapandı)
CREATE OR REPLACE FUNCTION public.exchange_release_item(p_item uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it record; old_s int;
BEGIN
  SELECT * INTO it FROM order_items WHERE id = p_item AND exchange_of IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  DELETE FROM order_items WHERE id = p_item;
  IF it.variant_id IS NOT NULL THEN
    SELECT stock INTO old_s FROM product_variants WHERE id = it.variant_id FOR UPDATE;
    INSERT INTO stock_events (product_id, variant_id, old_stock, new_stock, delta, source, changed_by)
    VALUES (it.product_id, it.variant_id, old_s, coalesce(old_s, 0) + it.quantity, it.quantity, 'exchange_release', auth.uid());
    UPDATE product_variants SET stock = coalesce(stock, 0) + it.quantity WHERE id = it.variant_id; -- başka bekleyen varsa ona ayrılır
  END IF;
END $$;

-- Tetikleyici: stok ARTINCA bekleyen değişime ayır. Adı "zz_" ile başlar: aynı anda çalışan tetikleyicilerin (pazaryeri kuyruğu
-- trg_marketplace_stock, stok görevleri…) EN SONUNDA çalışmalı — böylece pazaryeri kuyruğuna en son ayrılmış (düşmüş) stok yazılır.
CREATE OR REPLACE FUNCTION public.trg_exchange_reserve()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(NEW.stock, 0) > coalesce(OLD.stock, 0) AND coalesce(NEW.stock, 0) > 0 THEN
    PERFORM public.exchange_reserve_waiting(NEW.id);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS zz_exchange_reserve ON public.product_variants;
CREATE TRIGGER zz_exchange_reserve AFTER UPDATE OF stock ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.trg_exchange_reserve();

-- Stok ekranı: kaydedince son stok (değişime ayrılan düşülmüş) + kaç adet ayrıldı döner → "gelince haber ver" e-postası yalnız
-- kalan stok > 0 ise. Olay kaydı güncellemeden ÖNCE yazılır (geçmişte önce giriş, sonra ayırma görünsün).
CREATE OR REPLACE FUNCTION public.admin_set_stock(
  p_product_id uuid, p_variant_id uuid, p_new_stock integer, p_source text DEFAULT 'admin_manual'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old integer; v_final integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501'; END IF;
  IF p_new_stock IS NULL OR p_new_stock < 0 THEN RAISE EXCEPTION 'INVALID_STOCK'; END IF;
  IF p_variant_id IS NOT NULL THEN
    SELECT stock INTO v_old FROM product_variants WHERE id = p_variant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'VARIANT_NOT_FOUND'; END IF;
  ELSE
    SELECT stock INTO v_old FROM products WHERE id = p_product_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
  END IF;
  INSERT INTO stock_events (product_id, variant_id, old_stock, new_stock, delta, source, changed_by)
  VALUES (p_product_id, p_variant_id, v_old, p_new_stock, p_new_stock - COALESCE(v_old, 0), COALESCE(NULLIF(p_source, ''), 'admin_manual'), auth.uid());
  IF p_variant_id IS NOT NULL THEN
    UPDATE product_variants SET stock = p_new_stock WHERE id = p_variant_id;
    SELECT stock INTO v_final FROM product_variants WHERE id = p_variant_id;
  ELSE
    UPDATE products SET stock = p_new_stock WHERE id = p_product_id;
    v_final := p_new_stock;
  END IF;
  RETURN jsonb_build_object('ok', true, 'old', v_old, 'new', p_new_stock, 'final', v_final, 'reserved', greatest(p_new_stock - v_final, 0));
END $$;

REVOKE ALL ON FUNCTION public.exchange_reserve_waiting(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.exchange_release_item(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_exchange_reserve() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exchange_reserve_waiting(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.exchange_release_item(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.admin_set_stock(uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_stock(uuid, uuid, integer, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
SELECT 'stok bekleyen değişim hazır' AS durum;
