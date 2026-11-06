// Kargo etiketinin kodu + "etiket eskidi mi" kuralı (istemci: shipping-label.ts, sunucu: /api/admin/orders/labels).
type CodeFields = { cargo_tracking_number?: string | null; kargonomi_tracking_code?: string | null };
/** Etikete basılan kod: entegrasyonla (Kargonomi / Basit Kargo) gönderilende entegrasyon kodu (ör. KSUR…) — kargo firması
 *  şubede o kodu okutup KENDİ takip kodunu üretir; o kod sonra cargo_tracking_number'a yazılır (müşteri takibi) ama etiket
 *  değişmez (kullanıcı 2026-11-06: "kod değişti, yeniden yazdır" yanlış uyarıydı). Diğerlerinde takip kodu. */
export function labelCode(o: CodeFields): string {
  return String(o.kargonomi_tracking_code || o.cargo_tracking_number || "").trim();
}
/** Etiketteki kod değişti mi (etiket yeniden basılmalı) — yalnız etiket kodu (entegrasyon kodu) değişince; firmanın
 *  sonradan ürettiği takip kodu sayılmaz */
export function labelOutdated(o: CodeFields & { label_printed_code?: string | null }): boolean {
  const code = labelCode(o);
  if (!o.label_printed_code || !code) return false;
  return o.label_printed_code !== code && o.label_printed_code !== o.cargo_tracking_number;
}
