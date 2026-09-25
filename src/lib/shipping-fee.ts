// Seçili kargo yönteminin ücreti — sepet ve checkout ortak (tarayıcı tarafı
// gösterim). Asıl ücret SUNUCUDA aynı kuralla hesaplanır (src/lib/shipping.ts).
// Kupon ücretsiz-kargo veya yöntemin free_over eşiği sağlanırsa 0.
export function shipFee(m: any, productTotal: number, freeCoupon: boolean): number {
  if (!m) return 0;
  if (freeCoupon) return 0;
  if (m.free_over != null && productTotal >= Number(m.free_over)) return 0;
  return Number(m.fee || 0);
}

// Ücretsiz kargoya kalan tutar (eşik yoksa ya da geçildiyse null)
export function amountToFreeShipping(m: any, productTotal: number): number | null {
  if (!m || m.free_over == null || Number(m.fee || 0) === 0) return null;
  const rest = Number(m.free_over) - productTotal;
  return rest > 0 ? Math.round(rest * 100) / 100 : null;
}
