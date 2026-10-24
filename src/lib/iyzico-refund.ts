/* eslint-disable @typescript-eslint/no-explicit-any */
// iyzico'dan para iadesi (tek yer). Sipariş durumunu DEĞİŞTİRMEZ — çağıran, başarıdan sonra order_record_refund ile
// kaydeder (ödeme durumu, iade tutarı, sipariş geçmişi tek kuralla). Stoğa dokunmaz.
//
// Yöntem: ödeme numarasıyla iade (refundV2: /v2/payment/refund — paymentId + tutar). Sepetteki kalem ayrımına
// gerek yok; kısmi iade de aynı yoldan. Olmazsa yedek: eski yöntem (ödeme detayındaki kalem işlem kimliğiyle,
// tutar kalemlere sırayla dağıtılır). Not: eski kod detayda "paymentItems" arıyordu — iyzico alanı "itemTransactions".
import { createIyzicoClient, formatPrice, newConversationId } from "@/lib/iyzico";

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
    return { ok: false, error: `iyzico iadeyi kabul etmedi: ${v2?.errorMessage || detail?.errorMessage || "ödeme bulunamadı"} — iadeyi iyzico panelinden yapıp yöntem olarak 'Diğer' seçin.` };
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
      return { ok: false, error: `iyzico iade hatası: ${r?.errorMessage || "bilinmiyor"}${done > 0 ? ` (₺${(done / 100).toFixed(2)} iade edildi, kalanı iyzico panelinden)` : ""}` };
    }
    left -= part;
  }
  if (left > 0) return { ok: false, error: `₺${(left / 100).toFixed(2)} iade edilemedi (kalem tutarları yetmedi) — iyzico panelinden tamamlayın.` };
  return { ok: true };
}
