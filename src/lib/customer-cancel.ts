/* eslint-disable @typescript-eslint/no-explicit-any */
// MÜŞTERİ İPTALİ — sunucu tarafı (kural: src/lib/customer-cancel-rule.ts; kararlar 2026-11-12).
// Her durumda sipariş iptal olur, stok geri gelir ve kargo etiketi alınamaz; para iadesi gerekiyorsa:
//   - kart: iyzico'dan otomatik (order_record_refund) → order_mark_cancelled. iyzico kabul etmezse
//           order_cancel_refund_pending + "Ücret iadesi yap" işi (order_cases kind 'cancel', refund_pending)
//   - havale, ödeme onaylı: IBAN → order_cancel_refund_pending + iş (refund_pending, IBAN talepte)
//   - havale, "ödeme yaptım" ama onaylanmamış: IBAN → order_mark_cancelled + "havale geldiyse iade et" işi (check_transfer)
// Sonra: neden "Müşteri istedi", kredi geri, pazaryeri stok senkronu, müşteriye iptal e-postası, yöneticiye e-posta.
// Bağlantı: e-postadaki /siparis-iptal?r=<imzalı> (giriş gerekmez) ya da Hesabım (oturum + kendi siparişi).
import { iyzicoRefund } from "@/lib/iyzico-refund";
import { restoreOrderCredit } from "@/lib/store-credit";
import { kickMarketplaceSync } from "@/lib/marketplace/sync";
import { validIban } from "@/lib/after-sale";
import { customerCancelCheck, CUSTOMER_CANCEL_REASONS, type CancelOutcome } from "@/lib/customer-cancel-rule";
export { cancelToken, verifyCancelToken, cancelUrl } from "@/lib/customer-cancel-link";

export const CANCEL_COLS = "id, order_number, user_id, channel, import_source, status, payment_status, payment_method, iyzico_payment_id, shipment_status, kargonomi_shipment_id, kargonomi_tracking_code, cargo_tracking_number, total_amount, refunded_amount, created_at";

export const orderLabelOf = (o: any) => (o.order_number ? `YH${o.order_number}` : String(o.id).slice(0, 8).toUpperCase());
const money = (n: number) => `₺${n.toFixed(2)}`;
const maskIban = (i: string) => `${i.slice(0, 4)} … ${i.slice(-4)}`;

type Opts = { reason?: string; ip: string; via: "email" | "account"; paidClaim?: boolean; iban?: string; ibanName?: string };

/** İptali uygular. Hata → { error } (hiçbir şey değişmeden). */
export async function performCustomerCancel(sb: any, order: any, opts: Opts) {
  const chk = customerCancelCheck(order);
  if (!chk.ok) return { error: chk.why };
  const reason = (CUSTOMER_CANCEL_REASONS as readonly string[]).includes(String(opts.reason)) ? String(opts.reason) : null;
  const label = orderLabelOf(order);
  const remaining = Math.round((Number(order.total_amount) - Number(order.refunded_amount || 0)) * 100) / 100;
  const paid = ["paid", "partial_refund"].includes(order.payment_status);

  // Havale iadesi gerekiyorsa IBAN + alıcı adı (iptalden ÖNCE doğrula)
  const needIban = chk.mode === "bank_refund" || (chk.mode === "bank_ask" && opts.paidClaim === true);
  let iban: string | null = null, ibanName: string | null = null;
  if (needIban) {
    iban = validIban(String(opts.iban || ""));
    if (!iban) return { error: "Geçerli bir IBAN gir (TR ile başlayan 26 karakter)." };
    ibanName = String(opts.ibanName || "").trim().replace(/\s+/g, " ").slice(0, 80);
    if (ibanName.length < 3) return { error: "IBAN sahibinin adını ve soyadını yaz." };
  }

  const via = opts.via === "email" ? "e-postadaki bağlantı" : "Hesabım";
  const base = `Müşteri siparişi kendisi iptal etti (${via})${reason ? ` — neden: ${reason}` : ""}`;
  let outcome: CancelOutcome = "cancelled";
  let refunded = 0;
  let caseStatus: "refund_pending" | "check_transfer" | null = null;
  let extraNote = "";

  if (chk.mode === "card_refund") {
    const r = await iyzicoRefund(order.iyzico_payment_id, remaining, opts.ip, "Müşteri siparişi iptal etti");
    if (r.ok) {
      const { error } = await sb.rpc("order_record_refund", { p_order: order.id, p_amount: remaining, p_method: "iyzico", p_note: "Müşteri iptali — otomatik kart iadesi", p_actor: null });
      if (error) { console.error("[customer-cancel] iade kaydı", order.id, error.message); extraNote = ` — iyzico iadesi YAPILDI ama kaydedilemedi (${error.message}); ücret iadesini “iyzico panelinden yaptım” ile işaretle`; caseStatus = "refund_pending"; outcome = "card_refund_pending"; }
      else { refunded = remaining; outcome = "card_refunded"; }
    } else {
      console.error("[customer-cancel] iyzico iadesi", order.id, r.error);
      extraNote = ` — kart iadesi otomatik yapılamadı (${String(r.error).slice(0, 200)})`;
      caseStatus = "refund_pending"; outcome = "card_refund_pending";
    }
  } else if (chk.mode === "bank_refund") {
    caseStatus = "refund_pending"; outcome = "bank_refund_pending";
  } else if (chk.mode === "bank_ask" && opts.paidClaim === true) {
    caseStatus = "check_transfer"; outcome = "transfer_check";
  }

  // İptal: ödemesi alınmış ve iadesi bekleyen → order_cancel_refund_pending; değilse yönetici iptaliyle aynı
  const stillPaid = paid && refunded < remaining;
  const note = `${base}${refunded ? ` — ${money(refunded)} karta iade edildi` : ""}${extraNote}`;
  const { error } = stillPaid
    ? await sb.rpc("order_cancel_refund_pending", { p_order: order.id, p_note: note })
    : await sb.rpc("order_mark_cancelled", { p_order: order.id, p_note: note, p_actor: null });
  if (error) return { error: error.message, notifyAdmin: true };

  const customerNote = outcome === "transfer_check"
    ? `Ödeme yaptığını belirttin: havalen hesabımıza ulaştıysa ${money(remaining)} tutarını bildirdiğin IBAN'a (${maskIban(iban!)}) iade edeceğiz.`
    : null;
  await sb.from("orders").update({ cancel_reason: "customer", cancel_customer_note: customerNote }).eq("id", order.id);
  if (caseStatus) {
    // Açık talep (değişim / iade) olamaz: kargolanmamış siparişte yok; yine de varsa kapat
    await sb.from("order_cases").update({ closed_at: new Date().toISOString(), status: "iptal_ile_kapandi" }).eq("order_id", order.id).is("closed_at", null);
    await sb.from("order_cases").insert({ order_id: order.id, kind: "cancel", status: caseStatus, reason, iban, iban_name: ibanName });
  }
  await restoreOrderCredit(sb, order.id).catch(() => {});
  kickMarketplaceSync(500);

  import("@/lib/notifications").then(({ sendOrderNotification }) =>
    sendOrderNotification("order_cancelled", { orderId: order.id, userId: order.user_id })).catch(() => {});
  const adminLine: Record<CancelOutcome, string> = {
    cancelled: "Ödeme alınmamıştı; iade gerekmiyor.",
    card_refunded: `Kartla ödenmişti: <b>${money(refunded)}</b> iyzico'dan kendiliğinden iade edildi.`,
    card_refund_pending: `Kartla ödenmişti ama <b>iyzico iadesi otomatik yapılamadı</b>${extraNote ? ` (${extraNote.replace(/^ — /, "")})` : ""}. Siparişte “Ücret iadesi yap”: iyzico'dan yeniden dene ya da iyzico panelinden yapıp işaretle.`,
    bank_refund_pending: `Havaleyle ödenmişti: <b>${money(remaining)}</b> iade edilecek — IBAN: <b>${iban}</b> (${ibanName}). Gönderince siparişte “Ücret iadesi yap” → Havale.`,
    transfer_check: `Havale ödemesi henüz onaylanmamıştı; müşteri <b>ödediğini söylüyor</b>. Hesaba ${money(remaining)} geldiyse IBAN'a iade et: <b>${iban}</b> (${ibanName}). Siparişte “Havale gelmişti — iadeyi gönderdim” ya da “Havale gelmemiş”.`,
  };
  import("@/lib/after-sale-mail").then(({ sendAdminCaseEmail }) =>
    sendAdminCaseEmail(order.id, caseStatus ? "Müşteri iptal etti — ücret iadesi işi" : "Müşteri siparişi iptal etti", [
      `Müşteri <b>${label}</b> siparişini kendisi iptal etti; stok geri eklendi, kargo etiketi alınamaz.`,
      reason ? `Neden: <b>${reason}</b>` : "Neden belirtmedi.",
      adminLine[outcome],
    ])).catch(() => {});
  return { ok: true as const, outcome, refunded, amount: remaining, label, iban: iban ? maskIban(iban) : null };
}
