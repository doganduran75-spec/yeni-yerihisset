-- Kampanya e-postası izni — üye OLMAYAN kişiler (bülten aboneleri) için (2026-10-12).
-- Üyelerde izin profiles.marketing_consent'te (20261029). Gönderim kuralı (src/lib/marketing-mail.ts):
-- kampanya ve sepet hatırlatması yalnız izinli üyeye ya da izinli kişiye; her e-postada "abonelikten çık" bağlantısı.
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS marketing_consent boolean NOT NULL DEFAULT false;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS marketing_opt_out_at timestamptz;

-- Bülten formundan gelenler kendileri abone oldu → izinli
UPDATE public.contacts SET marketing_consent = true, marketing_consent_at = coalesce(marketing_consent_at, created_at)
WHERE source_channel = 'newsletter' AND NOT marketing_consent AND marketing_opt_out_at IS NULL;

-- KVKK (C6): profillerdeki eski TC kimlik numaraları gereksiz → silinir (artık toplanmıyor; iyzico'ya sabit
-- 11111111111 gider). Siparişlerin fatura kayıtları (ticari kayıt) değişmez.
UPDATE public.profiles SET identity_number = NULL WHERE identity_number IS NOT NULL;
