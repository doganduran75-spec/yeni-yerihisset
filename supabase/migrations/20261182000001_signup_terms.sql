-- ÜYELİK SÖZLEŞMESİ ONAYI (kullanıcı 2026-11-12): üyelik formunda zorunlu kutu "Üyelik Sözleşmesi'ni okudum, kabul
-- ediyorum" + isteğe bağlı kampanya kutusu + Aydınlatma Metni bilgi cümlesi. Onay anı + IP + tarayıcı + metnin sürümü
-- (legal_text_versions.hash, MIG 20261180) üyeye yazılır. Yazan: src/lib/terms-acceptance.ts (yalnız sunucu).
-- Not: profiles'ta kolon bazlı UPDATE yetkisi (20260927) bu kolonlara verilmez → üye kendi kaydını değiştiremez.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version     text,
  ADD COLUMN IF NOT EXISTS terms_ip          text,
  ADD COLUMN IF NOT EXISTS terms_user_agent  text;
