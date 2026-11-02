-- STOK BİLDİRİMİ AKIŞI (kullanıcı 2026-11-02): Bekleyenler = stok bekleniyor · Manuel bildirim = stok geldi ama
-- otomatik e-posta gitmedi (e-postasız ya da gönderilemedi) → elden haber ver · Bildirildi.
-- "Stok geldi" kuralı tek yerde: istenen ürün/numara stokta YA DA "her renk" talebinde modelin başka renginde
-- aynı numara stokta (stock_notify_targets ile aynı eşleşme). Pano + Stok Bildirimleri ekranı bunu okur.
-- SECURITY INVOKER: RLS geçerli — yönetici hepsini, üye yalnız kendi kaydını görür.
CREATE OR REPLACE FUNCTION public.stock_notify_ready()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT n.id
  FROM stock_notifications n
  JOIN products p ON p.id = n.product_id
  LEFT JOIN product_variants v ON v.id = n.variant_id
  WHERE n.status = 'pending' AND (
    (n.variant_id IS NOT NULL AND coalesce(v.stock, 0) > 0)
    OR (n.variant_id IS NULL AND coalesce(p.stock, 0) > 0)
    OR (n.any_color AND p.model_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM products tp
      JOIN product_variants tv ON tv.product_id = tp.id
      JOIN variant_options tov ON tov.id = tv.variant_option_id
      JOIN variant_options ao ON ao.id = v.variant_option_id
      WHERE tp.model_id = p.model_id AND tp.id <> p.id AND coalesce(tv.stock, 0) > 0
        AND lower(btrim(tov.value)) = lower(btrim(ao.value))
    ))
  );
$$;
REVOKE ALL ON FUNCTION public.stock_notify_ready() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_notify_ready() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
