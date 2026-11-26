import { NextRequest, NextResponse } from "next/server";
import { cancelReason } from "@/lib/cancel-reasons";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { iyzicoRefund } from "@/lib/iyzico-refund";
import { restoreOrderCredit } from "@/lib/store-credit";
import { kickMarketplaceSync } from "@/lib/marketplace/sync";
import { autoInvoiceSiteOrder } from "@/lib/parasut-invoice";
import { sendReturnCompletedEmail, sendExchangeCompletedEmail } from "@/lib/after-sale-mail";
import { exchangeBackResult } from "@/lib/exchange-return";

/* eslint-disable @typescript-eslint/no-explicit-any */

// SİPARİŞ İŞLEMLERİ (iptal / iade / ücret iadesi) — senaryo matrisi (migration 20261020000001).
// POST { action, orderId, ... }
//   refund : { amount, method: iyzico|iyzico_manual|bank_transfer|cash|other, note, confirmed } → ücret iadesi
//            (stoğa dokunmaz). iyzico = API ile otomatik; iyzico_manual = admin panelden yaptı, yalnız kaydet.
//            iyzico (otomatik) dışındaki yöntemlerde parayı admin gönderir → confirmed:true şart
//            (müşteriye "iaden yapıldı" e-postası gider).
//   cancel : { method?, note } → kargodan ÖNCE iptal; ödeme alınmışsa kalan tutar önce iade edilir,
//            stok geri eklenir, fatura kesilmediyse "Gerekmiyor"
//   return : { items: [{item_id, qty, restock}], note, refund?: {amount, method, note, credit} }
//            → kargodan SONRA iade geldi; seçilen (sağlam) ürünler stoğa; istenirse ücret iadesi
//   credit : kısmi iadede geri gelen ürünün YeriHisset Kredisi payı cüzdana (tam iadede kalan kredinin tamamı döner).
//            İadenin ücreti (para / kredi) yapılınca müşteriye "iaden tamamlandı" e-postası gider (kullanıcı 2026-11-26).
// iyzico seçilirse para iyzico'dan otomatik iade edilir; diğer yöntemlerde parayı admin gönderir,
// sistem kaydeder. Durum değişiklikleri veritabanında tek işlemle (tutarsız birleşim olmaz).

// card = kartla ödenmiş ama iyzico kaydı olmayan sipariş (elle girilen / eski siteden aktarılan): iade POS / ödeme
// panelinden elle yapılır, burada yalnız kaydedilir
const METHODS = new Set(["iyzico", "card", "bank_transfer", "cash", "marketplace", "other"]);

export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const sb = createAdminClient() as any;
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { action, orderId } = body as { action?: string; orderId?: string };
  if (!orderId) return NextResponse.json({ error: "orderId gerekli" }, { status: 400 });

  const { data: order } = await sb.from("orders")
    .select("id, user_id, channel, import_source, status, shipment_status, total_amount, refunded_amount, payment_status, payment_method, iyzico_payment_id")
    .eq("id", orderId).maybeSingle();
  if (!order) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";

  let refundedFull = false, fullCreditBack = 0;
  async function doRefund(amount: number, methodIn: string, note?: string): Promise<string | null> {
    const manual = methodIn === "iyzico_manual";
    const method = manual ? "iyzico" : methodIn;
    if (!METHODS.has(method)) return "İade yöntemi seçilmedi";
    if (!(amount > 0)) return "İade tutarı girilmedi";
    if ((manual || method !== "iyzico") && body.confirmed !== true) return "İadeyi yaptığını onayla";
    if (method === "iyzico" && !manual) {
      if (!order.iyzico_payment_id) return "Bu sipariş iyzico ile ödenmemiş; başka bir yöntem seçin";
      const r = await iyzicoRefund(order.iyzico_payment_id, amount, ip, note);
      if (!r.ok) return r.error;
    }
    const { data, error } = await sb.rpc("order_record_refund", {
      p_order: orderId, p_amount: amount, p_method: method, p_note: note || null, p_actor: user!.id,
    });
    if (error) return error.message;
    refundedFull = !!data?.full;
    // Tam iade → siparişte kullanılan YeriHisset Kredisi cüzdana döner
    if (data?.full) {
      const { data: rc, error: rcErr } = await sb.rpc("restore_order_credit", { p_order: orderId });
      if (rcErr) console.error("[order-action] kredi geri yüklenemedi", orderId, rcErr.message);
      fullCreditBack = Number(rc?.restored || 0);
    }
    // Müşteri iptalinin ücret iadesi işi (order_cases kind 'cancel', src/lib/customer-cancel.ts) tam iadeyle kapanır
    if (data?.full) {
      const done = new Date().toISOString();
      await sb.from("order_cases").update({ status: "refunded", closed_at: done, updated_at: done }).eq("order_id", orderId).eq("kind", "cancel").is("closed_at", null);
    }
    return null;
  }

  // Kısmi iade: geri gelen ürünün kredi payı cüzdana (tam iadede restoreOrderCredit kalanın tamamını zaten döndürdü)
  async function doCredit(amount: number): Promise<number> {
    if (!(amount > 0) || refundedFull) return 0;
    const { data, error } = await sb.rpc("restore_order_credit_part", { p_order: orderId, p_amount: Math.round(amount * 100) / 100 });
    if (error) { console.error("[order-action] kredi geri yüklenemedi", orderId, error.message); return 0; }
    const back = Number(data?.restored || 0);
    if (back > 0) {
      await sb.from("order_events").insert({ order_id: orderId, type: "refund", note: `${back.toFixed(2).replace(".", ",")} TL YeriHisset Kredisi cüzdana geri yüklendi (kısmi iade)`, created_by: user!.id });
    }
    return back;
  }
  // Ücret iadesi bittiğinde müşteriye "iaden tamamlandı" (yalnız site siparişi; iptalin kendi e-postası var)
  function mailCompleted(cash: number, method: string, credit: number) {
    if (!order.user_id || (order.channel || "site") !== "site" || (cash <= 0 && credit <= 0)) return;
    const m = method === "iyzico_manual" ? "iyzico" : method;
    sendReturnCompletedEmail(orderId!, { cash, method: m, credit }).catch(() => {});
  }

  const paid = ["paid", "partial_refund"].includes(order.payment_status);
  const remaining = Math.round((Number(order.total_amount) - Number(order.refunded_amount || 0)) * 100) / 100;

  if (action === "refund") {
    if (!paid) return NextResponse.json({ error: "Ödemesi alınmamış siparişe ücret iadesi girilemez" }, { status: 400 });
    // Sıra kuralı (src/lib/order-next-step.ts): para iadesi ya iptalle ya da ürün geri GELDİKTEN sonra
    const { data: its } = await sb.from("order_items").select("returned_qty").eq("order_id", orderId);
    const anyReturned = order.shipment_status === "returned" || ((its as any[]) || []).some((i) => Number(i.returned_qty || 0) > 0);
    if (order.status !== "cancelled" && !anyReturned) {
      return NextResponse.json({ error: "Ücret iadesi, ürün geri gelince “İade al” ile ya da kargodan önce “Siparişi iptal et” ile yapılır" }, { status: 400 });
    }
    const cash = Number(body.amount) || 0, credit = Number(body.credit) || 0;
    if (cash > 0 || !(credit > 0)) {
      const err = await doRefund(cash, String(body.method || ""), body.note);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }
    const creditBack = await doCredit(credit);
    if (order.status !== "cancelled") mailCompleted(cash, String(body.method || ""), refundedFull ? fullCreditBack : creditBack);
  } else if (action === "cancel") {
    // İptal edilemeyecek siparişte para İADE EDİLMEDEN dur (order_mark_cancelled'daki kuralların aynısı).
    // Eskiden önce ücret iadesi yapılıyor, iptal sonra reddediliyordu → para iade, sipariş iptal değil.
    const shippedNow = ["shipped", "delivered", "undelivered", "returned"].includes(order.shipment_status || "waiting");
    const blocked = order.status === "cancelled" ? "Sipariş zaten iptal edilmiş"
      : (order.channel || "site") !== "site" && !order.import_source ? "Pazaryeri siparişi pazaryerinden iptal edilir"
      : shippedNow ? "Kargolanmış sipariş iptal edilemez — \"İade al\" kullanın"
      : null;
    if (blocked) return NextResponse.json({ error: blocked }, { status: 400 });
    // İptal nedeni (zorunlu) + müşteriye not (e-postada görünür; "Diğer"de zorunlu) — src/lib/cancel-reasons.ts
    const reason = cancelReason(String(body.reason || ""));
    const customerNote = String(body.customer_note || "").trim().slice(0, 500) || null;
    if (!reason) return NextResponse.json({ error: "İptal nedenini seç" }, { status: 400 });
    if (reason.key === "other" && !customerNote) return NextResponse.json({ error: "“Diğer” için müşteriye notu yaz (e-postada görünür)" }, { status: 400 });
    if (paid && remaining > 0) {
      const err = await doRefund(remaining, String(body.method || ""), body.note);
      if (err) return NextResponse.json({ error: `Ücret iadesi yapılamadı: ${err}` }, { status: 400 });
    }
    const cancelNote = [`İptal nedeni: ${reason.label.replace(/ \(.*\)$/, "")}`, customerNote ? `müşteriye not: “${customerNote}”` : "", body.note ? String(body.note) : ""].filter(Boolean).join(" — ");
    const { error } = await sb.rpc("order_mark_cancelled", { p_order: orderId, p_note: cancelNote, p_actor: user.id });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await sb.from("orders").update({ cancel_reason: reason.key, cancel_customer_note: customerNote }).eq("id", orderId);
    await restoreOrderCredit(sb, orderId!).catch(() => {});
    kickMarketplaceSync(500);
    if (order.user_id && (order.channel || "site") === "site") {
      import("@/lib/notifications").then(({ sendOrderNotification }) =>
        sendOrderNotification("order_cancelled", { orderId, userId: order.user_id }),
      ).catch(() => {});
    }
  } else if (action === "return") {
    const items = Array.isArray(body.items) ? body.items : [];
    const { data, error } = await sb.rpc("order_receive_return", { p_order: orderId, p_items: items, p_note: body.note || null, p_actor: user.id });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (Number(data?.restocked) > 0) kickMarketplaceSync(500);
    // Satış sonrası talep (src/lib/after-sale.ts): iade geldi → talep kapanır.
    // Değişimde geri gelen ürün ("Geri gelen ürün ulaştı"; müşteri seçmeden de gelebilir — YH25047, 2026-11-26):
    // her çiftte müşteride ödediği kadar kaldıysa değişim tamam, sipariş "oldu" (fatura sırası) + müşteriye "değişimin tamamlandı";
    // çiftin tamamı geri geldiyse değişim iadeye döner (ücret iadesi sırası). Kural: exchangeBackResult.
    const { data: openCase } = await sb.from("order_cases").select("id, kind, status, items, keep_item_id").eq("order_id", orderId).is("closed_at", null).maybeSingle();
    if (openCase) {
      const done = new Date().toISOString();
      if (openCase.kind === "return") {
        await sb.from("order_cases").update({ status: "received", closed_at: done, updated_at: done }).eq("id", openCase.id);
      } else if (openCase.kind === "exchange" && ["alt_shipped", "alt_delivered", "none_fit", "keep_chosen", "label_sent"].includes(openCase.status)) {
        const { data: its } = await sb.from("order_items").select("id, quantity, returned_qty, unit_price, exchange_of, variant_name, products(title)").eq("order_id", orderId);
        const all = (its as any[]) || [];
        const res = exchangeBackResult(all, ((openCase.items as any[]) || []).map((x) => x.order_item_id));
        if (res.allBack) {
          await sb.from("order_cases").update({ status: "returned_all", closed_at: done, updated_at: done }).eq("id", openCase.id);
          await sb.from("orders").update({ fit_status: "return" }).eq("id", orderId);
          await sb.from("order_events").insert({ order_id: orderId, type: "note", note: "Değişim: ikisi de geri geldi — değişim iadeye döndü (ücret iadesi)" });
        } else if (res.done) {
          const keepId = openCase.keep_item_id || res.keepId;
          await sb.from("order_cases").update({ status: "resolved", keep_item_id: keepId, closed_at: done, updated_at: done }).eq("id", openCase.id);
          await sb.from("orders").update({ fit_status: "ok" }).eq("id", orderId);
          // Değişim tamam: tutulan numarayla fatura kendiliğinden (geri gelen adet faturaya girmez)
          void autoInvoiceSiteOrder(sb, orderId, "değişim tamamlandı");
          const k = all.find((i) => i.id === keepId);
          sendExchangeCompletedEmail(orderId, k ? `${k.products?.title ?? "Ürün"}${k.variant_name ? ` (${k.variant_name})` : ""}` : null).catch(() => {});
        }
      }
    }
    const cash = Number(body.refund?.amount) || 0, credit = Number(body.refund?.credit) || 0;
    if (body.refund && cash > 0) {
      const err = await doRefund(cash, String(body.refund.method || ""), body.refund.note || body.note);
      if (err) return NextResponse.json({ error: `İade kaydedildi ama ücret iadesi yapılamadı: ${err}` }, { status: 400 });
    }
    const creditBack = body.refund ? await doCredit(credit) : 0;
    if (body.refund) mailCompleted(cash, String(body.refund.method || ""), refundedFull ? fullCreditBack : creditBack);
  } else {
    return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
  }

  // "İade faturasını da kestim" (İade al / Ücret iadesi penceresi): faturası kesilmiş siparişte iade faturası işaretlenir
  if (body.return_invoiced === true && (action === "return" || action === "refund")) {
    await sb.from("orders").update({ invoice_status: "return_invoiced" }).eq("id", orderId).eq("invoice_status", "invoiced");
  }
  // Kapalı (ör. eski siteden "tamamlandı" aktarılmış) siparişe iade / para iadesi işlendiyse iş yeniden açılır →
  // panodaki "Bekleyen işlerim"de görünür (iade faturası adımı)
  if (action === "return" || action === "refund") {
    await sb.from("orders").update({ is_closed: false, closed_at: null } as any).eq("id", orderId).eq("is_closed", true);
  }

  const { data: fresh } = await sb.from("orders")
    .select("id, status, payment_status, shipment_status, invoice_status, refunded_amount, refund_status, refund_method")
    .eq("id", orderId).maybeSingle();
  return NextResponse.json({ ok: true, order: fresh });
}
