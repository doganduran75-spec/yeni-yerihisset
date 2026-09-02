-- F16: Stok bildirimini kişiye (contact) bağla + admin manuel ekleyebilsin
-- Instagram-only kişi de stok bildirimi isteyebilsin diye contact_id/instagram eklendi.

ALTER TABLE public.stock_notifications
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS instagram  text;

-- Misafir kuralını gevşet: kişi (contact_id) veya instagram da geçerli iletişimdir
ALTER TABLE public.stock_notifications DROP CONSTRAINT IF EXISTS stock_notifications_contact_check;
ALTER TABLE public.stock_notifications ADD CONSTRAINT stock_notifications_contact_check
  CHECK (
    user_id IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL
    OR contact_id IS NOT NULL OR instagram IS NOT NULL
  );

-- Admin panelinden manuel ekleme için INSERT izni (mevcut insert'ler service_role ile)
DROP POLICY IF EXISTS "admin insert stock_notifications" ON public.stock_notifications;
CREATE POLICY "admin insert stock_notifications"
  ON public.stock_notifications FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
