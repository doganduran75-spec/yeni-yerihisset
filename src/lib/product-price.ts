/**
 * Ürün fiyat gösterim yardımcıları.
 *
 * Varyasyonlu ürünlerde aktif varyasyonların fiyatları eşitse tek fiyat,
 * farklıysa "min – max" aralığı döner.
 */

type VariantForPrice = {
  price: number;
  is_active?: boolean | null;
};

type ProductForPrice = {
  price: number;
  has_variants?: boolean | null;
  product_variants?: VariantForPrice[] | null;
};

/** Aktif varyasyon fiyatlarını döner; varyasyon yoksa ürün fiyatını döner. */
export function getVariantPriceRange(product: ProductForPrice): {
  min: number;
  max: number;
  isSingle: boolean;
} {
  if (product.has_variants && product.product_variants?.length) {
    const prices = product.product_variants
      .filter((v) => v.is_active !== false)
      .map((v) => v.price)
      .filter((p) => typeof p === "number" && p > 0);

    if (prices.length > 0) {
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      return { min, max, isSingle: min === max };
    }
  }
  return { min: product.price, max: product.price, isSingle: true };
}

const fmt = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 2 });

/** "₺1.299,00" veya "₺799,00 – ₺1.299,00" formatında metin döner. */
export function formatPriceDisplay(product: ProductForPrice): string {
  const { min, max, isSingle } = getVariantPriceRange(product);
  return isSingle ? `₺${fmt(min)}` : `₺${fmt(min)} – ₺${fmt(max)}`;
}

/** Kargo ücretsizliği için kullanılacak fiyat (en düşük aktif fiyat). */
export function getMinPrice(product: ProductForPrice): number {
  return getVariantPriceRange(product).min;
}
