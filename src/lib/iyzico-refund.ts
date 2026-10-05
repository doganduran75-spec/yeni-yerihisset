/* eslint-disable @typescript-eslint/no-explicit-any */
// iyzico'dan para iadesi (tek yer): ödeme detayından işlem kimliğini bulur, iadeyi ister.
// Sipariş durumunu DEĞİŞTİRMEZ — çağıran, başarıdan sonra order_record_refund ile kaydeder
// (ödeme durumu, iade tutarı, sipariş geçmişi tek kuralla). Stoğa dokunmaz.
import { createIyzicoClient, formatPrice, newConversationId } from "@/lib/iyzico";

export async function iyzicoRefund(
  paymentId: string,
  amount: number,
  ip: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const iyzipay = createIyzicoClient();
  const detail = await new Promise<any>((resolve) => {
    iyzipay.payment.retrieve(
      { locale: "tr", conversationId: newConversationId(), paymentId },
      (_err: any, result: any) => resolve(result),
    );
  });
  const transactionId = detail?.paymentItems?.[0]?.paymentTransactionId;
  if (!transactionId) return { ok: false, error: "iyzico işlem kimliği alınamadı; iadeyi iyzico panelinden yapıp yöntem olarak 'Diğer' seçin." };

  const result = await new Promise<any>((resolve) => {
    iyzipay.refund.create(
      {
        locale: "tr",
        conversationId: newConversationId(),
        paymentTransactionId: transactionId,
        price: formatPrice(amount),
        currency: "TRY",
        ip,
        ...(reason ? { description: reason } : {}),
      },
      (_err: any, r: any) => resolve(r),
    );
  });
  if (result?.status !== "success") {
    console.error("[iyzico-refund]", result);
    return { ok: false, error: result?.errorMessage ?? "iyzico iade hatası" };
  }
  return { ok: true };
}
