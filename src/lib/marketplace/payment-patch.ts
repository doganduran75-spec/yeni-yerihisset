/* eslint-disable @typescript-eslint/no-explicit-any */
// İptal / iade → ödeme ve fatura alanları (sipariş iptal/iade matrisi, migration 20261020000001):
// pazaryerinde iptal → ödeme "Alınmadı", fatura kesilmediyse "Gerekmiyor"; iade (Returned) →
// ödeme "İade edildi", iade tutarı = sipariş tutarı (ciroda 0). Fatura kesildiyse iade faturası elle.
export function marketplacePaymentPatch(status: string, total: number, invoiceStatus?: string | null): Record<string, any> {
  if (status === "cancelled") {
    return { payment_status: "failed", ...((invoiceStatus || "pending") === "pending" ? { invoice_status: "not_required" } : {}) };
  }
  if (status === "refunded") {
    return { payment_status: "refunded", refund_status: "full", refunded_amount: Math.round(total * 100) / 100, refund_method: "marketplace" };
  }
  return {};
}
