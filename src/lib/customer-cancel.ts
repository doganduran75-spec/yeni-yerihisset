/* eslint-disable @typescript-eslint/no-explicit-any */
// MÜŞTERİ İPTALİ — sunucu tarafı (kural: src/lib/customer-cancel-rule.ts). Yönetici iptaliyle aynı yol:
// (kartla ödendiyse iyzico iadesi + order_record_refund) → order_mark_cancelled (stok geri, kargo İptal, fatura Gerekmiyor)
// → neden "Müşteri istedi" → kredi geri → pazaryeri stok senkronu → müşteriye iptal e-postası + yöneticiye e-posta.
// Bağlantı: e-postadaki /siparis-iptal?r=<imzalı> (giriş gerekmez) ya da Hesabım (oturum + kendi siparişi).
import { iyzicoRefund } from "@/lib/iyzico-refund";
import { restoreOrderCredit } from "@/lib/store-credit";
import { kickMarketplaceSync } from "@/lib/marketplace/sync";
import { customerCancelCheck, CUSTOMER_CANCEL_REASONS } from "@/lib/customer-cancel-rule";
export { cancelToken, verifyCancelToken, cancelUrl } from "@/lib/customer-cancel-link";

export const CANCEL_COLS = "id, order_number, user_id, channel, import_source, status, payment_status, payment_method, iyzico_payment_id, shipment_status, kargonomi_shipment_id, kargonomi_tracking_code, cargo_tracking_number, total_amount, refunded_amount, created_at";

export const orderLabelOf = (o: any) => (o.order_number ? `YH${o.order_number}` : String(o.id).slice(0, 8).toUpperCase());

/** İptali uygular. Hata → { error } (para iade edilmeden durur). */
export async function performCustomerCancel(sb: any, order: any, opts: { reason?: string; ip: string; via: "email" | "account" }) {
  const chk = customerCancelCheck(order);
  if (!chk.ok) return { error: chk.why };
  const reason = (CUSTOMER_CANCEL_REASONS as readonly string[]).includes(String(opts.reason)) ? String(opts.reason) : null;
  const label = orderLabelOf(order);
  const remaining = Math.round((Number(order.total_amount) - Number(order.refunded_amount || 0)) * 100) / 100;
  let refunded = 0;

  if (chk.mode === "card_refund" && remaining > 0) {
    const r = await iyzicoRefund(order.iyzico_payment_id, remaining, opts.ip, "Müşteri siparişi iptal etti");
    if (!r.ok) {
      console.error("[customer-cancel] iyzico iadesi", order.id, r.error);
      await sb.from("order_events").insert({ order_id: order.id, type: "note", note: `Müşteri iptal etmek istedi ama kart iadesi yapılamadı (${String(r.error).slice(0, 200)}) — sipariş iptal EDİLMEDİ` });
      return { error: "İptal şu an tamamlanamadı. Ekibimize ilettik, en kısa sürede iptal edip ödemeni iade edeceğiz." , notifyAdmin: true };
    }
    const { error } = await sb.rpc("order_record_refund", { p_order: order.id, p_amount: remaining, p_method: "iyzico", p_note: "Müşteri iptali — otomatik kart iadesi", p_actor: null });
    if (error) return { error: error.message, notifyAdmin: true };
    refunded = remaining;
  }

  const note = `Müşteri siparişi kendisi iptal etti (${opts.via === "email" ? "e-postadaki bağlantı" : "Hesabım"})${reason ? ` — neden: ${reason}` : ""}${refunded ? ` — ₺${refunded.toFixed(2)} karta iade edildi` : ""}`;
  const { error } = await sb.rpc("order_mark_cancelled", { p_order: order.id, p_note: note, p_actor: null });
  if (error) return { error: error.message, notifyAdmin: true };
  await sb.from("orders").update({ cancel_reason: "customer", cancel_customer_note: null }).eq("id", order.id);
  await restoreOrderCredit(sb, order.id).catch(() => {});
  kickMarketplaceSync(500);

  import("@/lib/notifications").then(({ sendOrderNotification }) =>
    sendOrderNotification("order_cancelled", { orderId: order.id, userId: order.user_id })).catch(() => {});
  import("@/lib/after-sale-mail").then(({ sendAdminCaseEmail }) =>
    sendAdminCaseEmail(order.id, "Müşteri siparişi iptal etti", [
      `Müşteri <b>${label}</b> siparişini kendisi iptal etti; stok geri eklendi.`,
      reason ? `Neden: <b>${reason}</b>` : "Neden belirtmedi.",
      refunded ? `Kartla ödenmişti: <b>₺${refunded.toFixed(2)}</b> iyzico'dan kendiliğinden iade edildi.` : "Ödeme alınmamıştı; iade gerekmiyor.",
    ])).catch(() => {});
  return { ok: true as const, refunded, label };
}
