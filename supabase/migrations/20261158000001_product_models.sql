-- Model: kategorinin alt kırılımı (kullanıcı kararı 2026-11-01). Her renk ayrı ürün olduğundan aynı modelin
-- renklerini gruplamak için: Bot › 01, Bot › 02 … Yalnız yönetim panelinde (stok / üretim gruplaması);
-- müşteriye gösterilmez → anon ve üye okuyamaz. Tanımlama: Ayarlar › Varyasyonlar › Modeller.
-- Not: products.model_code ayrı alandır ("Ürün kodu", Google'a mpn) — bununla karışmasın.
CREATE TABLE IF NOT EXISTS public.product_models (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  code        text NOT NULL CHECK (btrim(code) <> ''),   -- "01", "02" …
  name        text,                                       -- isteğe bağlı kısa ad ("Klasik bağcıklı")
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS product_models_cat_code_uq ON public.product_models (category_id, lower(btrim(code)));

ALTER TABLE public.product_models ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_models FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_models TO authenticated;
GRANT ALL ON public.product_models TO service_role;
DROP POLICY IF EXISTS product_models_admin_all ON public.product_models;
CREATE POLICY product_models_admin_all ON public.product_models FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Ürünün modeli. Model silinirse ürün modelsiz kalır (panel, kullanılan modelin silinmesine izin vermez).
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS model_id uuid REFERENCES public.product_models(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_model ON public.products (model_id);

-- Model ürünün kategorisine ait olmalı: kategori değişince (ya da başka kategorinin modeli seçilince) model boşalır
CREATE OR REPLACE FUNCTION public.products_model_category_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.model_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM product_models m WHERE m.id = NEW.model_id AND m.category_id IS NOT DISTINCT FROM NEW.category_id
  ) THEN
    NEW.model_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_products_model_category ON public.products;
CREATE TRIGGER trg_products_model_category BEFORE INSERT OR UPDATE OF model_id, category_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_model_category_guard();

NOTIFY pgrst, 'reload schema';
