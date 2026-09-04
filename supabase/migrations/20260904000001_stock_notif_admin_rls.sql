-- ─────────────────────────────────────────────────────────────────────────────
-- F16 düzeltme: admin TÜM stok bildirimlerini okuyup güncelleyebilsin
--
-- Self-host DB'de mevcut politikalar yalnızca "kendi user_id'in" idi:
--   stock_notif_select_own : SELECT USING (auth.uid() = user_id)
--   stock_notif_update_own : UPDATE USING (auth.uid() = user_id)
-- Bu yüzden admin, contact_id ile eklenen (user_id NULL) kayıtları göremiyor
-- ve "Bildirildi" yapamıyordu. RLS permissive (OR) olduğundan, aşağıdaki
-- admin politikaları mevcutlara EKlenir; normal üyeler yine kendi kayıtlarını görür.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin read stock_notifications" ON public.stock_notifications;
CREATE POLICY "admin read stock_notifications"
  ON public.stock_notifications FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "admin update stock_notifications" ON public.stock_notifications;
CREATE POLICY "admin update stock_notifications"
  ON public.stock_notifications FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
