-- Tahmin edilemeyen kupon kodları (kullanıcı kararı 2026-10-25): kodlar sistemden (src/lib/coupon-code.ts), panelde
-- basit kodlar "Kodu yenile" ile değiştirilebilir. Kodla BULUNAN tek kupon e-posta karşılığı ücretsiz kargo idi
-- (KARGOBEDAVA) → artık amacıyla bulunur; kodu yenilense de bozulmaz.
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS purpose text;
UPDATE public.coupons SET purpose = 'lead_magnet' WHERE code = 'KARGOBEDAVA' AND purpose IS NULL;
