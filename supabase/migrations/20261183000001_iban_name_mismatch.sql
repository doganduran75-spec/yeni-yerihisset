-- IBAN SAHİBİ ↔ SİPARİŞ SAHİBİ (kullanıcı 2026-11-12): havale iadesi müşterinin yazdığı IBAN'a gider (müşteri iptali,
-- satış sonrası iade). Sipariş e-postası yanlış kişiye gittiyse o kişi kendi IBAN'ını yazıp iadeyi kendine
-- yönlendirebilir → IBAN sahibinin adı siparişteki adla uyuşmazsa talep işaretlenir (engellenmez; yönetici kontrol eder).
-- Yazan: src/lib/customer-cancel.ts, src/app/api/after-sale/route.ts (kural: src/lib/name-match.ts).
ALTER TABLE public.order_cases ADD COLUMN IF NOT EXISTS iban_name_mismatch boolean NOT NULL DEFAULT false;
