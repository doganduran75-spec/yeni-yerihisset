-- Aksiyon-tetikli kupon: bu bayrak açık kuponlar, yeni üye kaydolduğunda
-- otomatik olarak hesabına eklenir (ve bilgilendirme e-postası gönderilir).
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS auto_assign_on_signup boolean NOT NULL DEFAULT false;
