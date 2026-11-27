/* eslint-disable @typescript-eslint/no-explicit-any */
// iyzico'dan para iadesi (tek yer). Sipariş durumunu DEĞİŞTİRMEZ — çağıran, başarıdan sonra order_record_refund ile
// kaydeder (ödeme durumu, iade tutarı, sipariş geçmişi tek kuralla). Stoğa dokunmaz.
//
// Yöntem: ödeme numarasıyla iade (refundV2: /v2/payment/refund — paymentId + tutar). Sepetteki kalem ayrımına
// gerek yok; kısmi iade de aynı yoldan. Olmazsa yedek: eski yöntem (ödeme detayındaki kalem işlem kimliğiyle,
// tutar kalemlere sırayla dağıtılır). Not: eski kod detayda "paymentItems" arıyordu — iyzico alanı "itemTransactions".
import { createIyzicoClient, formatPrice, newConversationId } from "@/lib/iyzico";

// iyzico bakiyesi yetmeyince iade reddedilir (kullanıcı 2026-11-26: yeni sipariş gelince bakiye oluşur) → yöneticiye
// anlaşılır yazı + yeniden deneme yolu (Ücret iadesi penceresinde "iyzico'dan şimdi otomatik iade et" her zaman durur)
export function refundErrorText(msg: string | null | undefined): string {
  const m = String(msg || "bilinmiyor");
  return /bakiye|balance|yetersiz|insufficient/i.test(m)
    ? `iyzico hesabında iade için yeterli bakiye yok (${m}). Yeni ödeme gelince “Ücret iadesi yap” → “iyzico'dan şimdi otomatik iade et”i yeniden dene ya da iadeyi iyzico panelinden yapıp “panelden kendim yaptım”ı seç.`
    : `${m} — “Ücret iadesi yap” → “iyzico'dan şimdi otomatik iade et” ile yeniden deneyebilirsin ya da iyzico panelinden yapıp “panelden kendim yaptım”ı seç.`;
}

const call = (fn: (cb: (err: any, r: any) => void) => void) =>
  new Promise<any>((resolve) => fn((err, r) => resolve(r ?? { status: "failure", errorMessage: err?.message || String(err) })));

export async function iyzicoRefund(
  paymentId: string,
  amount: number,
  ip: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const iyzipay = createIyzicoClient() as any;

  // 1) Ödeme numarasıyla iade
  const v2 = await call((cb) => iyzipay.refundV2.create(
    { locale: "tr", conversationId: newConversationId(), paymentId: String(paymentId), price: formatPrice(amount), currency: "TRY", ip }, cb));
  if (v2?.status === "success") return { ok: true };
  console.error("[iyzico-refund] v2:", JSON.stringify({ errorCode: v2?.errorCode, errorMessage: v2?.errorMessage }));

  // 2) Yedek: kalem bazında (ödeme detayı → itemTransactions; tutar kalemlere sırayla)
  const detail = await call((cb) => iyzipay.payment.retrieve({ locale: "tr", conversationId: newConversationId(), paymentId: String(paymentId) }, cb));
  const items: any[] = detail?.itemTransactions || detail?.paymentItems || [];
  if (!items.length) {
    return { ok: false, error: `iyzico iadeyi kabul etmedi: ${refundErrorText(v2?.errorMessage || detail?.errorMessage || "ödeme bulunamadı")}` };
  }
  let left = Math.round(amount * 100);
  for (const it of items) {
    if (left <= 0) break;
    const can = Math.round(Number(it.paidPrice ?? it.price ?? 0) * 100);
    const part = Math.min(left, can);
    if (part <= 0) continue;
    const r = await call((cb) => iyzipay.refund.create({
      locale: "tr", conversationId: newConversationId(), paymentTransactionId: it.paymentTransactionId,
      price: formatPrice(part / 100), currency: "TRY", ip, ...(reason ? { description: reason } : {}),
    }, cb));
    if (r?.status !== "success") {
      console.error("[iyzico-refund] kalem:", JSON.stringify({ errorCode: r?.errorCode, errorMessage: r?.errorMessage }));
      const done = Math.round(amount * 100) - left;
      return { ok: false, error: done > 0
        ? `iyzico iade hatası: ${r?.errorMessage || "bilinmiyor"} (₺${(done / 100).toFixed(2)} iade edildi, kalanı iyzico panelinden)`
        : `iyzico iade hatası: ${refundErrorText(r?.errorMessage || v2?.errorMessage)}` };
    }
    left -= part;
  }
  if (left > 0) return { ok: false, error: `₺${(left / 100).toFixed(2)} iade edilemedi (kalem tutarları yetmedi) — iyzico panelinden tamamlayın.` };
  return { ok: true };
}
