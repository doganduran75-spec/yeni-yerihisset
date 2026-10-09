-- KAMPANYA E-POSTASI İZNİ (ticari elektronik ileti) — temel altyapı (2026-10-09)
-- Kişi izni şuralardan verir/geri alır: Hesabım › İletişim tercihleri · ödeme sayfasındaki onay kutusu ·
-- e-postadaki bağlantı (/kampanya-izni). Her değişiklik ispat için marketing_consent_log'a yazılır.
-- Not: kampanya gönderiminin yalnız izinlilere gitmesi ve İYS kaydı ayrı karar (bkz. "çerezler" notu).
-- İşlem e-postaları (sipariş, kargo, şifre) bu izinden bağımsızdır.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS marketing_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_consent_source text;
-- Kolonları yalnız sunucu yazar (kayıt tutulsun diye) — profiles'ta kolon bazlı UPDATE yetkisi (20260927) bunlara verilmez.

CREATE TABLE IF NOT EXISTS public.marketing_consent_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email      text,
  granted    boolean NOT NULL,
  source     text NOT NULL,          -- account | checkout | email_link | admin
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mcl_user ON public.marketing_consent_log(user_id, created_at DESC);
ALTER TABLE public.marketing_consent_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_consent_log FROM anon, authenticated;

SELECT count(*) FILTER (WHERE marketing_consent) AS izinli, count(*) AS toplam FROM public.profiles;
