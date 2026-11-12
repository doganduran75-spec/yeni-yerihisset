// MÜŞTERİ KENDİ SİPARİŞİNİ İPTAL EDER (kullanıcı 2026-11-12) — kural (import yok; regresyon Node'da doğrudan yükler).
// Mesaj / e-posta trafiği olmasın: Hesabım › Siparişlerim'de ve sipariş e-postalarında "Siparişi iptal et".
//   - Yalnız site siparişi (pazaryeri / aktarılan değil), iptal edilmemiş, KARGO ETİKETİ ALINMAMIŞ (kargoya hazırlanmadı).
//   - Ödeme alınmadıysa (havale bekliyor / kart tamamlanmadı) → anında iptal, stok geri.
//   - Kartla ödendiyse (iyzico) → anında iptal + ödeme iyzico'dan kendiliğinden iade.
//   - Havaleyle ödendiyse → şimdilik müşteri iptal edemez (iade IBAN'a elle gider; karar bekliyor) — mesajla.
export type CancelOrderLike = {
  channel?: string | null; import_source?: string | null; status?: string | null; payment_status?: string | null;
  payment_method?: string | null; iyzico_payment_id?: string | null; shipment_status?: string | null;
  kargonomi_shipment_id?: string | null; kargonomi_tracking_code?: string | null; cargo_tracking_number?: string | null;
};
export type CancelMode = "instant" | "card_refund";
export type CancelCheck = { ok: true; mode: CancelMode } | { ok: false; why: string };

const SHIPPED = ["shipped", "delivered", "undelivered", "returned"];

export function customerCancelCheck(o: CancelOrderLike): CancelCheck {
  if ((o.channel || "site") !== "site" || o.import_source) return { ok: false, why: "Bu sipariş buradan iptal edilemez." };
  if (o.status === "cancelled") return { ok: false, why: "Sipariş zaten iptal edilmiş." };
  if (SHIPPED.includes(o.shipment_status || "waiting")) return { ok: false, why: "Sipariş kargoya verildi; teslim aldıktan sonra iade edebilirsin." };
  if (o.kargonomi_shipment_id || o.kargonomi_tracking_code || o.cargo_tracking_number)
    return { ok: false, why: "Siparişin kargoya hazırlandı, artık buradan iptal edilemiyor. Teslim aldıktan sonra iade edebilir ya da bize mesaj yazabilirsin." };
  const paid = ["paid", "partial_refund"].includes(o.payment_status || "");
  if (!paid) return { ok: true, mode: "instant" };
  if (o.iyzico_payment_id) return { ok: true, mode: "card_refund" };
  return { ok: false, why: "Ödemen alındığı için iptali ekibimiz yapıyor: siparişindeki Mesaj düğmesinden iptal istediğini yazman yeterli." };
}

/** Müşterinin seçebileceği iptal nedenleri (isteğe bağlı; siparişin notlarına yazılır) */
export const CUSTOMER_CANCEL_REASONS = [
  "Fikrimi değiştirdim",
  "Yanlış numara / ürün seçtim",
  "Başka yerden aldım",
  "Teslimat süresi uzun",
  "Ödeme yöntemini değiştirmek istiyorum",
  "Diğer",
] as const;
