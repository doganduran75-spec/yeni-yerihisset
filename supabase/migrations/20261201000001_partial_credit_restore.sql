-- KISMİ İADEDE YERİHİSSET KREDİSİ (kullanıcı 2026-11-26): kredi eskiden yalnız TAM iade / iptalde cüzdana dönüyordu
-- (credit_restored bayrağı). Kısmi iadede geri gelen ürünün kredi payı da dönsün. Kural (src/lib/exchange-return.ts
-- refundSplit): geri gelen ürün bedeli (kupon payı düşülmüş) siparişin para / kredi oranında bölünür; para kısmı karta /
-- hesaba, kredi kısmı cüzdana. Tümü geri geldiyse kalan her şey (kargo dahil) iade edilir.
-- credit_restored_amount: cüzdana bugüne kadar dönen kredi. credit_restored = tamamı döndü. Tekrar çalıştırmak güvenli.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS credit_restored_amount numeric NOT NULL DEFAULT 0;
UPDATE public.orders SET credit_restored_amount = coalesce(credit_used, 0)
 WHERE credit_restored = true AND credit_restored_amount = 0 AND coalesce(credit_used, 0) > 0;

-- Kalan krediyi geri yükle (tam iade / iptal). Kısmi iadede dönen kısım tekrar verilmez.
CREATE OR REPLACE FUNCTION public.restore_order_credit(p_order uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; v_left numeric; v_aff uuid; v_bal numeric;
BEGIN
  SELECT id, user_id, coalesce(credit_used, 0) AS used, credit_restored_amount AS back INTO o
    FROM orders WHERE id = p_order FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', true, 'restored', 0); END IF;
  v_left := round(o.used - o.back, 2);
  IF v_left <= 0 THEN RETURN jsonb_build_object('ok', true, 'restored', 0); END IF;
  UPDATE orders SET credit_restored = true, credit_restored_amount = o.used WHERE id = p_order;

  UPDATE affiliate_profiles SET credit_balance = round(credit_balance + v_left, 2)
   WHERE user_id = o.user_id
   RETURNING id, credit_balance INTO v_aff, v_bal;
  IF v_aff IS NULL THEN RETURN jsonb_build_object('ok', true, 'restored', 0, 'no_wallet', true); END IF;

  INSERT INTO store_credit_ledger (affiliate_id, user_id, type, amount, balance_after, order_id, note)
  VALUES (v_aff, o.user_id, 'refund', v_left, v_bal, p_order, 'İptal/iade — YeriHisset Kredisi iadesi');
  RETURN jsonb_build_object('ok', true, 'restored', v_left, 'balance', v_bal);
END $$;

-- Kısmi iade: geri gelen ürünün kredi payını geri yükle (en çok kalan kredi kadar)
CREATE OR REPLACE FUNCTION public.restore_order_credit_part(p_order uuid, p_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; v_take numeric; v_aff uuid; v_bal numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN jsonb_build_object('ok', true, 'restored', 0); END IF;
  SELECT id, user_id, coalesce(credit_used, 0) AS used, credit_restored_amount AS back INTO o
    FROM orders WHERE id = p_order FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', true, 'restored', 0); END IF;
  v_take := round(least(p_amount, o.used - o.back), 2);
  IF v_take <= 0 THEN RETURN jsonb_build_object('ok', true, 'restored', 0); END IF;
  UPDATE orders SET credit_restored_amount = round(o.back + v_take, 2), credit_restored = (o.back + v_take >= o.used - 0.005)
   WHERE id = p_order;

  UPDATE affiliate_profiles SET credit_balance = round(credit_balance + v_take, 2)
   WHERE user_id = o.user_id
   RETURNING id, credit_balance INTO v_aff, v_bal;
  IF v_aff IS NULL THEN RETURN jsonb_build_object('ok', true, 'restored', 0, 'no_wallet', true); END IF;

  INSERT INTO store_credit_ledger (affiliate_id, user_id, type, amount, balance_after, order_id, note)
  VALUES (v_aff, o.user_id, 'refund', v_take, v_bal, p_order, 'Kısmi iade — YeriHisset Kredisi iadesi');
  RETURN jsonb_build_object('ok', true, 'restored', v_take, 'balance', v_bal);
END $$;

-- İptal edilip krediyi geri almış sipariş SONRADAN ödenirse dönen kredi yeniden düşülür (eskisiyle aynı; tutar artık
-- credit_restored_amount). Bakiye yetmezse eldeki kadar düşülür, eksik döner (yönetici notu).
CREATE OR REPLACE FUNCTION public.reclaim_order_credit(p_order uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_back numeric; v_user uuid; v_aff uuid; v_bal numeric; v_take numeric;
BEGIN
  SELECT credit_restored_amount, user_id INTO v_back, v_user FROM orders WHERE id = p_order FOR UPDATE;
  IF coalesce(v_back, 0) <= 0 THEN RETURN jsonb_build_object('ok', true, 'taken', 0, 'shortfall', 0); END IF;
  UPDATE orders SET credit_restored = false, credit_restored_amount = 0 WHERE id = p_order;

  SELECT id, credit_balance INTO v_aff, v_bal FROM affiliate_profiles WHERE user_id = v_user FOR UPDATE;
  IF v_aff IS NULL THEN RETURN jsonb_build_object('ok', true, 'taken', 0, 'shortfall', v_back); END IF;
  v_take := least(v_back, greatest(v_bal, 0));
  IF v_take > 0 THEN
    UPDATE affiliate_profiles SET credit_balance = round(credit_balance - v_take, 2) WHERE id = v_aff
     RETURNING credit_balance INTO v_bal;
    INSERT INTO store_credit_ledger (affiliate_id, user_id, type, amount, balance_after, order_id, note)
    VALUES (v_aff, v_user, 'spend', -v_take, v_bal, p_order, 'İptal edilen sipariş sonradan ödendi — kredi yeniden kullanıldı');
  END IF;
  RETURN jsonb_build_object('ok', true, 'taken', v_take, 'shortfall', round(v_back - v_take, 2));
END $$;

REVOKE ALL ON FUNCTION public.restore_order_credit(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_order_credit_part(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reclaim_order_credit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_order_credit(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_order_credit_part(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.reclaim_order_credit(uuid) TO service_role;
