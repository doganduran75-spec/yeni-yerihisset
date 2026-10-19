-- AYNI BARKOD İKİ KEZ KAYDEDİLEMEZ (kullanıcı isteği 2026-10-19). Aynı barkod iki varyantta olunca pazaryerine
-- hangisinin stoğu / fiyatı gideceği belirsizleşiyor; Hepsiburada aynı kodu iki kez görünce paketi reddediyordu
-- (DuplicateMerchantSkuSpecified). Sebebi büyük ihtimalle "Ürünü kopyala"ydı (barkod da kopyalanıyordu — düzeltildi).
-- Karşılaştırma büyük / küçük harf ve baştaki / sondaki boşluk farkını yok sayar (pazaryerleri de öyle).
-- Kural yalnız barkod DEĞİŞİRKEN / yeni varyantta işler → bugün var olan tekrarlar kaydetmeyi kilitlemez
-- (regresyon onları "Aynı pazaryeri kodu birden çok varyantta" diye listeler; düzeltince tekrar oluşamaz).

CREATE INDEX IF NOT EXISTS product_variants_barcode_norm_idx
  ON public.product_variants (upper(btrim(barcode)))
  WHERE barcode IS NOT NULL AND btrim(barcode) <> '';

CREATE OR REPLACE FUNCTION public.check_variant_barcode_unique()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE other record;
BEGIN
  -- Boş barkod = barkod yok; baştaki / sondaki boşluk atılır
  NEW.barcode := NULLIF(btrim(NEW.barcode), '');
  IF NEW.barcode IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND upper(NEW.barcode) IS NOT DISTINCT FROM upper(btrim(OLD.barcode)) THEN RETURN NEW; END IF;

  SELECT v.id, p.title, o.value AS size INTO other
    FROM public.product_variants v
    LEFT JOIN public.products p ON p.id = v.product_id
    LEFT JOIN public.variant_options o ON o.id = v.variant_option_id
   WHERE upper(btrim(v.barcode)) = upper(NEW.barcode) AND v.barcode IS NOT NULL AND btrim(v.barcode) <> ''
     AND v.id IS DISTINCT FROM NEW.id
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Bu barkod (%) başka bir üründe kayıtlı: %', NEW.barcode,
      coalesce(other.title, 'ürün') || coalesce(' — ' || other.size, '')
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_variant_barcode_unique ON public.product_variants;
CREATE TRIGGER trg_variant_barcode_unique
  BEFORE INSERT OR UPDATE OF barcode ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.check_variant_barcode_unique();

REVOKE ALL ON FUNCTION public.check_variant_barcode_unique() FROM PUBLIC, anon, authenticated;
