-- STOK TALEBİ: "Model · Numara" (kullanıcı isteği 2026-11-02, Bot · 01 · 41).
-- Talep yine bir ürün + numaraya bağlıdır (müşterinin sorduğu renk); any_color = true ise
-- aynı modelin (products.model_id) başka renginde aynı numara stoğa girince de haber verilir.
-- Yalnız panelden (Manuel Ekle) işaretlenir; müşteri tarafında seçenek yok.
ALTER TABLE public.stock_notifications ADD COLUMN IF NOT EXISTS any_color boolean NOT NULL DEFAULT false;

-- Stoğa giren ürün/numara → haber verilecek bekleyen talepler:
--   tam eşleşme (aynı ürün + numara) + any_color talepler (aynı model, aynı numara değeri).
-- Ürünün modeli sonradan kalkarsa any_color talep yalnız kendi ürününe bakar.
CREATE OR REPLACE FUNCTION public.stock_notify_targets(p_product_id uuid, p_variant_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT n.id FROM stock_notifications n
  WHERE n.status = 'pending' AND n.product_id = p_product_id AND n.variant_id IS NOT DISTINCT FROM p_variant_id
  UNION
  SELECT n.id
  FROM stock_notifications n
  JOIN products ap ON ap.id = n.product_id
  JOIN product_variants av ON av.id = n.variant_id
  JOIN variant_options ao ON ao.id = av.variant_option_id
  JOIN products tp ON tp.id = p_product_id
  JOIN product_variants tv ON tv.id = p_variant_id AND tv.product_id = tp.id
  JOIN variant_options tov ON tov.id = tv.variant_option_id
  WHERE n.status = 'pending' AND n.any_color
    AND ap.model_id IS NOT NULL AND ap.model_id = tp.model_id
    AND lower(btrim(ao.value)) = lower(btrim(tov.value));
$$;
REVOKE ALL ON FUNCTION public.stock_notify_targets(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stock_notify_targets(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
