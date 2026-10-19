-- AYNI STOK KODU (SKU) İKİ KEZ KAYDEDİLEMEZ (kullanıcı isteği 2026-10-19) — barkod kuralının (20261128) aynısı.
-- Hepsiburada / Amazon eşleştirmesi SKU ile yapılabildiği için aynı SKU iki varyantta pazaryerini karıştırır.
-- Büyük / küçük harf ve baştaki / sondaki boşluk farkı yok sayılır; boş SKU serbest. Yalnız SKU DEĞİŞİRKEN / yeni
-- varyantta işler → bugün var olan tekrarlar (ör. ürün formunun eskiden uydurduğu "Dod-40") kaydetmeyi kilitlemez.

CREATE INDEX IF NOT EXISTS product_variants_sku_norm_idx
  ON public.product_variants (upper(btrim(sku)))
  WHERE sku IS NOT NULL AND btrim(sku) <> '';

CREATE OR REPLACE FUNCTION public.check_variant_sku_unique()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE other record;
BEGIN
  NEW.sku := NULLIF(btrim(NEW.sku), '');
  IF NEW.sku IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND upper(NEW.sku) IS NOT DISTINCT FROM upper(btrim(OLD.sku)) THEN RETURN NEW; END IF;

  SELECT v.id, p.title, o.value AS size INTO other
    FROM public.product_variants v
    LEFT JOIN public.products p ON p.id = v.product_id
    LEFT JOIN public.variant_options o ON o.id = v.variant_option_id
   WHERE upper(btrim(v.sku)) = upper(NEW.sku) AND v.sku IS NOT NULL AND btrim(v.sku) <> ''
     AND v.id IS DISTINCT FROM NEW.id
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Bu stok kodu (SKU %) başka bir üründe kayıtlı: %', NEW.sku,
      coalesce(other.title, 'ürün') || coalesce(' — ' || other.size, '')
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_variant_sku_unique ON public.product_variants;
CREATE TRIGGER trg_variant_sku_unique
  BEFORE INSERT OR UPDATE OF sku ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.check_variant_sku_unique();

REVOKE ALL ON FUNCTION public.check_variant_sku_unique() FROM PUBLIC, anon, authenticated;
