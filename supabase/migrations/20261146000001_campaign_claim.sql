-- "KUPONU HESABINA EKLE" (Instagram / story bağlantısı; kullanıcı kararları 2026-10-24):
--   /kampanya/<slug> bağlantısından gelen ziyaretçiye o OTURUM boyunca turuncu şerit gösterilir. Üye tek tıkla
--   kuponu hesabına ekler; misafir e-postasını yazar → şifresiz hesap açılır, kupon eklenir, şifre belirleme
--   bağlantısı gider (şifre ekranında İŞARETSİZ kampanya izni kutusu — kupon izne bağlı değil).
--   Kupon süresi hesaba eklendiği andan başlar: coupons.claim_valid_days (boş = kuponun kendi bitiş tarihi).
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS claim_valid_days integer CHECK (claim_valid_days IS NULL OR claim_valid_days BETWEEN 1 AND 365);
