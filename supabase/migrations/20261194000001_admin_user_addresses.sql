-- Yönetici müşteri adreslerini görebilir / ekleyebilir (kullanıcı 2026-11-16: Siparişler › Yeni Sipariş).
-- user_addresses'te yalnız "kendi adresin" kuralları vardı (tablo elle kurulmuş, migration'da kural yoktu): yönetici
-- yeni eklediği ya da aradığı müşterinin adresini okuyamıyor → pencere "kayıtlı adres bulunamadı" diyor, manuel sipariş
-- oluşmuyordu (adres aslında kayıtlıydı). Yönetici tüm adresleri okur / ekler / düzeltir; üye kuralları aynen kalır.
-- Tekrar çalıştırmak güvenli.

DROP POLICY IF EXISTS "Admins manage all addresses" ON public.user_addresses;
CREATE POLICY "Admins manage all addresses" ON public.user_addresses
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
