-- YeriHisset Kredisi: harcama / geri yükleme TEK ADIMDA (güvenlik taraması 2026-11-16, bulgu 1).
-- Eskiden sunucu bakiyeyi okuyup yeni bakiyeyi yazıyordu: aynı anda iki sipariş gönderilince ikisi de tüm krediyi
-- kullanıyordu (500 ₺ kredi → 1000 ₺ ürün). Geri yüklemede de iki yol (iptal + süre dolumu) aynı anda çalışınca kredi
-- iki kez iade oluyordu. Şimdi bakiye satırı UPDATE ... WHERE credit_balance >= tutar ile düşülür, geri yükleme
-- credit_restored bayrağını koşullu çevirerek yalnız bir kez yapılır. Tekrar çalıştırmak güvenli.

-- Sipariş için kredi düş. Bakiye yetmezse (başka bir sipariş az önce harcadıysa) ok=false, hiçbir şey değişmez.
CREATE OR REPLACE FUNCTION public.spend_order_credit(p_order uuid, p_user uuid, p_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_aff uuid; v_bal numeric; v_used numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN jsonb_build_object('ok', true, 'applied', 0); END IF;
  SELECT coalesce(credit_used, 0) INTO v_used FROM orders WHERE id = p_order FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'ORDER_NOT_FOUND'); END IF;
  IF v_used > 0 THEN RETURN jsonb_build_object('ok', true, 'applied', v_used, 'already', true); END IF;

  UPDATE affiliate_profiles SET credit_balance = round(credit_balance - p_amount, 2)
   WHERE user_id = p_user AND credit_balance >= p_amount
   RETURNING id, credit_balance INTO v_aff, v_bal;
  IF v_aff IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_CREDIT'); END IF;

  UPDATE orders SET credit_used = p_amount, credit_restored = false WHERE id = p_order;
  INSERT INTO store_credit_ledger (affiliate_id, user_id, type, amount, balance_after, order_id, note)
  VALUES (v_aff, p_user, 'spend', -p_amount, v_bal, p_order, 'Sepette YeriHisset Kredisi kullanımı');
  RETURN jsonb_build_object('ok', true, 'applied', p_amount, 'balance', v_bal);
END $$;

-- İptal / iade: kullanılan krediyi bir kez geri yükle (bayrak koşullu çevrilir; ikinci çağrı hiçbir şey yapmaz).
CREATE OR REPLACE FUNCTION public.restore_order_credit(p_order uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_used numeric; v_user uuid; v_aff uuid; v_bal numeric;
BEGIN
  UPDATE orders SET credit_restored = true
   WHERE id = p_order AND credit_restored = false AND coalesce(credit_used, 0) > 0
   RETURNING credit_used, user_id INTO v_used, v_user;
  IF v_used IS NULL THEN RETURN jsonb_build_object('ok', true, 'restored', 0); END IF;

  UPDATE affiliate_profiles SET credit_balance = round(credit_balance + v_used, 2)
   WHERE user_id = v_user
   RETURNING id, credit_balance INTO v_aff, v_bal;
  IF v_aff IS NULL THEN RETURN jsonb_build_object('ok', true, 'restored', 0, 'no_wallet', true); END IF;

  INSERT INTO store_credit_ledger (affiliate_id, user_id, type, amount, balance_after, order_id, note)
  VALUES (v_aff, v_user, 'refund', v_used, v_bal, p_order, 'İptal/iade — YeriHisset Kredisi iadesi');
  RETURN jsonb_build_object('ok', true, 'restored', v_used, 'balance', v_bal);
END $$;

-- İptal edilip krediyi geri almış sipariş SONRADAN ödenirse (kart formu süre dolduktan sonra ödendi) kredi yeniden
-- düşülür: müşteri indirimli tutarı ödedi. Bakiye yetmezse eldeki kadar düşülür, eksik döner (yönetici notu).
CREATE OR REPLACE FUNCTION public.reclaim_order_credit(p_order uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_used numeric; v_user uuid; v_aff uuid; v_bal numeric; v_take numeric;
BEGIN
  UPDATE orders SET credit_restored = false
   WHERE id = p_order AND credit_restored = true AND coalesce(credit_used, 0) > 0
   RETURNING credit_used, user_id INTO v_used, v_user;
  IF v_used IS NULL THEN RETURN jsonb_build_object('ok', true, 'taken', 0, 'shortfall', 0); END IF;

  SELECT id, credit_balance INTO v_aff, v_bal FROM affiliate_profiles WHERE user_id = v_user FOR UPDATE;
  IF v_aff IS NULL THEN RETURN jsonb_build_object('ok', true, 'taken', 0, 'shortfall', v_used); END IF;
  v_take := least(v_used, greatest(v_bal, 0));
  IF v_take > 0 THEN
    UPDATE affiliate_profiles SET credit_balance = round(credit_balance - v_take, 2) WHERE id = v_aff
     RETURNING credit_balance INTO v_bal;
    INSERT INTO store_credit_ledger (affiliate_id, user_id, type, amount, balance_after, order_id, note)
    VALUES (v_aff, v_user, 'spend', -v_take, v_bal, p_order, 'İptal edilen sipariş sonradan ödendi — kredi yeniden kullanıldı');
  END IF;
  RETURN jsonb_build_object('ok', true, 'taken', v_take, 'shortfall', round(v_used - v_take, 2));
END $$;

-- Yalnız sunucu (service_role) çağırır; tarayıcıdan (anon / authenticated) çağrılamaz
REVOKE ALL ON FUNCTION public.spend_order_credit(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_order_credit(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reclaim_order_credit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_order_credit(uuid, uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_order_credit(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reclaim_order_credit(uuid) TO service_role;
