-- BARKOD / SKU KURALI SIKILAŞTI (kullanıcı geri bildirimi 2026-10-19): eskiden yalnız kod DEĞİŞİRKEN kontrol ediliyordu;
-- değişmeden kaydedilen eski bir tekrar (ör. pasif üründe) sessizce kaydoluyordu. Artık kod her yazıldığında
-- (ürün formu her kayıtta yazar) başka bir varyantta varsa kayıt reddedilir — pasif ürün de olsa.
-- Stok / fiyat güncellemeleri kod sütununa dokunmadığı için etkilenmez (UPDATE OF barcode / sku).
-- + variant_code_conflicts: ürün formu kaydetmeden ÖNCE sorar → yarım kayıt olmaz, hangi üründe olduğu söylenir.

CREATE OR REPLACE FUNCTION public.check_variant_barcode_unique()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE other record;
BEGIN
  NEW.barcode := NULLIF(btrim(NEW.barcode), '');
  IF NEW.barcode IS NULL THEN RETURN NEW; END IF;
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

CREATE OR REPLACE FUNCTION public.check_variant_sku_unique()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE other record;
BEGIN
  NEW.sku := NULLIF(btrim(NEW.sku), '');
  IF NEW.sku IS NULL THEN RETURN NEW; END IF;
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

-- Ürün formu için ön kontrol: verilen barkod / SKU'lar BAŞKA bir üründe var mı (aynı ürünün kendi numaraları hariç;
-- form içi tekrarı form kendisi yakalar). Yalnız yönetici.
CREATE OR REPLACE FUNCTION public.variant_code_conflicts(p_product uuid, p_barcodes text[], p_skus text[])
RETURNS TABLE(kind text, code text, product_title text, size text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Yetkisiz' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT 'barkod'::text, v.barcode, p.title, o.value
    FROM public.product_variants v
    LEFT JOIN public.products p ON p.id = v.product_id
    LEFT JOIN public.variant_options o ON o.id = v.variant_option_id
   WHERE v.barcode IS NOT NULL AND btrim(v.barcode) <> ''
     AND upper(btrim(v.barcode)) IN (SELECT upper(btrim(x)) FROM unnest(coalesce(p_barcodes, '{}')) x WHERE btrim(coalesce(x, '')) <> '')
     AND v.product_id IS DISTINCT FROM p_product
  UNION ALL
  SELECT 'SKU'::text, v.sku, p.title, o.value
    FROM public.product_variants v
    LEFT JOIN public.products p ON p.id = v.product_id
    LEFT JOIN public.variant_options o ON o.id = v.variant_option_id
   WHERE v.sku IS NOT NULL AND btrim(v.sku) <> ''
     AND upper(btrim(v.sku)) IN (SELECT upper(btrim(x)) FROM unnest(coalesce(p_skus, '{}')) x WHERE btrim(coalesce(x, '')) <> '')
     AND v.product_id IS DISTINCT FROM p_product
  LIMIT 20;
END $$;

REVOKE ALL ON FUNCTION public.variant_code_conflicts(uuid, text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.variant_code_conflicts(uuid, text[], text[]) TO authenticated;
