-- ŞİFRESİZ HESAPLAR GERÇEKTEN ŞİFRESİZ OLSUN
-- Sorun: Supabase Auth, auth.admin.createUser şifre verilmeden çağrılınca hesaba kendiliğinden
-- RASTGELE bir şifre koyuyor. account_password_state() bu hesapları "password" (şifreli üye)
-- sanıyordu → misafir ikinci siparişinde / WordPress'ten aktarılan müşteri misafir siparişinde
-- "Bu e-posta zaten kayıtlı, giriş yapın" duyuyordu (bilmediği şifreyle); sipariş sonucu sayfasında
-- hesap aktivasyon kutusu çıkmıyordu; kartla ödeyen misafire aktivasyon e-postası gitmiyordu.
-- (Regresyon paketi "Misafir siparişi" senaryosu yakaladı.)
-- Çözüm: şifresiz açılan hesabın şifresi hemen silinir (mark_account_passwordless) + mevcut hesaplar onarılır.

CREATE OR REPLACE FUNCTION public.mark_account_passwordless(p_user uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public, auth AS $$
  -- Yalnız hiç giriş yapmamış hesap (şifre belirleyip giriş yapmış birinin şifresi asla silinmez)
  WITH u AS (
    UPDATE auth.users SET encrypted_password = ''
     WHERE id = p_user AND last_sign_in_at IS NULL
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM u)
$$;
REVOKE ALL ON FUNCTION public.mark_account_passwordless(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_account_passwordless(uuid) TO service_role;

-- Mevcut hesapları onar: hiç giriş yapmamış, kayıt formuyla gelmemiş (doğrulama e-postası
-- gönderilmemiş), yönetici olmayan ve WordPress'ten aktarılmış ya da sitede (girişsiz = misafir)
-- sipariş vermiş hesaplar. Kayıt formuyla açılan hesaplara dokunulmaz.
UPDATE auth.users u SET encrypted_password = ''
 WHERE coalesce(u.encrypted_password, '') <> ''
   AND u.last_sign_in_at IS NULL
   AND EXISTS (
     SELECT 1 FROM public.profiles p
      WHERE p.id = u.id AND p.role <> 'admin' AND p.email_verify_sent_at IS NULL
        AND (p.import_source IS NOT NULL
             OR EXISTS (SELECT 1 FROM public.orders o WHERE o.user_id = u.id AND coalesce(o.channel, 'site') = 'site' AND o.import_source IS NULL))
   );

SELECT
  count(*) FILTER (WHERE coalesce(encrypted_password, '') = '') AS sifresiz_hesap,
  count(*) AS toplam_hesap
FROM auth.users;
