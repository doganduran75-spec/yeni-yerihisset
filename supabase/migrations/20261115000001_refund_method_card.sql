-- İade yöntemi "card" (2026-10-12): kartla ödenmiş ama iyzico kaydı olmayan siparişler (elle girilen / eski siteden
-- aktarılan) — iade ödeme / POS panelinden elle yapılır, sistemde yalnız kaydedilir. Etiket: "Kredi kartı".
CREATE OR REPLACE FUNCTION public.refund_method_label(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p WHEN 'iyzico' THEN 'iyzico' WHEN 'card' THEN 'Kredi kartı' WHEN 'bank_transfer' THEN 'Havale/EFT' WHEN 'cash' THEN 'Kapıda / nakit'
                WHEN 'marketplace' THEN 'Pazaryeri' ELSE coalesce(nullif(p, ''), 'Diğer') END
$$;
