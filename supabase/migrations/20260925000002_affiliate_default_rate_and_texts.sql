-- 1) Satış ortaklığı: yeni başvurulara verilecek VARSAYILAN komisyon oranı
--    (ortak bazlı oran affiliate_profiles.commission_rate'te zaten var; admin
--    her ortağın oranını ayrıca değiştirebilir).
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS affiliate_default_rate numeric(5,2) NOT NULL DEFAULT 10.00;

-- 2) "Sipariş kurtarma" e-postası: "Numaran tükenmeden" → "Stoklar tükenmeden"
UPDATE public.email_templates
SET body_html = replace(body_html, 'Numaran tükenmeden', 'Stoklar tükenmeden')
WHERE trigger = 'order_recovery' AND body_html LIKE '%Numaran tükenmeden%';

-- 3) Daha önce KAPATILMIŞ hesapların e-postasını serbest bırak (yeni kapatmalar
--    bunu uygulama tarafında zaten yapıyor). Kişi aynı e-postayla sıfırdan
--    üye olabilir / misafir sipariş verebilir. Siparişler user_id ile bağlı kalır.
UPDATE auth.users u
SET email = 'silindi-' || u.id || '@anonim.yerihisset.invalid',
    raw_user_meta_data = '{}'::jsonb
FROM public.profiles p
WHERE p.id = u.id AND p.deleted_at IS NOT NULL
  AND u.email NOT LIKE 'silindi-%';

UPDATE auth.identities i
SET identity_data = jsonb_set(coalesce(i.identity_data, '{}'::jsonb), '{email}', to_jsonb('silindi-' || i.user_id || '@anonim.yerihisset.invalid'))
FROM public.profiles p
WHERE p.id = i.user_id AND p.deleted_at IS NOT NULL
  AND coalesce(i.identity_data->>'email', '') NOT LIKE 'silindi-%';

UPDATE public.profiles
SET email = 'silindi-' || id || '@anonim.yerihisset.invalid'
WHERE deleted_at IS NOT NULL AND coalesce(email, '') NOT LIKE 'silindi-%';
