-- #2 Fırsatlar "yararlandın" — kupon fırsatı türü.
-- Karar: (a) dış-link fırsatları KALIR, yanına "coupon" türü eklenir;
--        (b) claim_limit = kişinin kaç kez YARARLANABİLECEĞİ; her yararlanma
--        1 kullanım hakkı ekler (user_coupons.max_uses), her biri 1 kullanımlık.

-- partner_opportunities: tür + kupon + limit
ALTER TABLE partner_opportunities
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'external',   -- external | coupon
  ADD COLUMN IF NOT EXISTS coupon_id uuid REFERENCES coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claim_limit integer NOT NULL DEFAULT 1;

-- url yalnız dış-link için gerekli; kupon fırsatında zorunlu olmasın.
ALTER TABLE partner_opportunities ALTER COLUMN url DROP NOT NULL;

-- user_coupons: kişiye tanınan TOPLAM kullanım hakkı (yararlanma sayısı).
-- NULL → eski davranış (coupons.per_user_limit ile sınırlı). Kupon fırsatında
-- her "Yararlan" bu değeri +1 artırır (claim_limit'e kadar).
ALTER TABLE user_coupons
  ADD COLUMN IF NOT EXISTS max_uses integer;
