-- GÜVENLİK FAZ 2: Kuponlar herkese açık LİSTELENMESİN.
-- Önce: aktif TÜM kuponlar (kod, indirim, limitler, ortak bağlantısı) anon
-- anahtarla okunabiliyordu → yayınlanmamış kampanya / ortağa özel kodlar sızıyordu.
-- Şimdi tarayıcı yalnız şunları görür (hepsi aktif olmak şartıyla):
--   • kampanya sayfası olan kuponlar (campaign_slug) — /kampanya/<slug>
--   • aktif bir fırsata bağlı kuponlar — /firsatlar
--   • kişinin KENDİ hesabına tanımlı kuponlar — sepet / ödeme / hesabım
-- Admin hepsini görür (mevcut "Admins manage coupons"). Kupon KULLANIMI değişmez:
-- kod sunucuda (/api/coupons/validate, service role) doğrulanır.
DROP POLICY IF EXISTS "Public read active coupons" ON public.coupons;
DROP POLICY IF EXISTS coupons_visible_read ON public.coupons;
CREATE POLICY coupons_visible_read ON public.coupons
  FOR SELECT USING (
    is_active = true AND (
      campaign_slug IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.partner_opportunities po
                 WHERE po.coupon_id = coupons.id AND po.is_active = true)
      OR EXISTS (SELECT 1 FROM public.user_coupons uc
                 WHERE uc.coupon_id = coupons.id AND uc.user_id = auth.uid())
    )
  );

SELECT policyname, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = 'coupons' ORDER BY 1;
