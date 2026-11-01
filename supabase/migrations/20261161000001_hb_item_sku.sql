-- Hepsiburada siparişinde satıcı stok kodu gelmeyebiliyor (yalnız HBSKU); kalem HBSKU → ilan üzerinden ürüne
-- eşleniyor ama "Ürün Kodu" boş kalıyordu (kullanıcı 2026-11-01). Kod artık eşleşen numaranın stok kodunu yazar;
-- eskiler: eşlenmiş, kodu boş Hepsiburada kalemlerine numaranın stok kodu.
UPDATE public.order_items i
   SET sku = v.sku
  FROM public.product_variants v, public.orders o
 WHERE i.variant_id = v.id AND i.order_id = o.id
   AND o.channel = 'hepsiburada'
   AND coalesce(i.sku, '') = '' AND coalesce(v.sku, '') <> '';
