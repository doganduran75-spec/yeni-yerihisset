import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { iyzicoRefund } from "@/lib/iyzico-refund";
import { restoreOrderCredit } from "@/lib/store-credit";
import { kickMarketplaceSync } from "@/lib/marketplace/sync";

/* eslint-disable @typescript-eslint/no-explicit-any */

// SİPARİŞ İŞLEMLERİ (iptal / iade / ücret iadesi) — senaryo matrisi (migration 20261020000001).
// POST { action, orderId, ... }
//   refund : { amount, method: iyzico|iyzico_manual|bank_transfer|cash|other, note, confirmed } → ücret iadesi
//            (stoğa dokunmaz). iyzico = API ile otomatik; iyzico_manual = admin panelden yaptı, yalnız kaydet.
//            iyzico (otomatik) dışındaki yöntemlerde parayı admin gönderir → confirmed:true şart
//            (müşteriye "iaden yapıldı" e-postası gider).
//   cancel : { method?, note } → kargodan ÖNCE iptal; ödeme alınmışsa kalan tutar önce iade edilir,
//            stok geri eklenir, fatura kesilmediyse "Gerekmiyor"
//   return : { items: [{item_id, qty, restock}], note, refund?: {amount, method, note} }
//            → kargodan SONRA iade geldi; seçilen (sağlam) ürünler stoğa; istenirse ücret iadesi
// iyzico seçilirse para iyzico'dan otomatik iade edilir; diğer yöntemlerde parayı admin gönderir,
// sistem kaydeder. Durum değişiklikleri veritabanında tek işlemle (tutarsız birleşim olmaz).

const METHODS = new Set(["iyzico", "bank_transfer", "cash", "marketplace", "other"]);

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
    // Tam iade → siparişte kullanılan YeriHisset Kredisi cüzdana döner
    if (data?.full) await restoreOrderCredit(sb, orderId!).catch(() => {});
    return null;
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
    const err = await doRefund(Number(body.amount), String(body.method || ""), body.note);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  } else if (action === "cancel") {
    // İptal edilemeyecek siparişte para İADE EDİLMEDEN dur (order_mark_cancelled'daki kuralların aynısı).
    // Eskiden önce ücret iadesi yapılıyor, iptal sonra reddediliyordu → para iade, sipariş iptal değil.
    const shippedNow = ["shipped", "delivered", "undelivered", "returned"].includes(order.shipment_status || "waiting");
    const blocked = order.status === "cancelled" ? "Sipariş zaten iptal edilmiş"
      : (order.channel || "site") !== "site" && !order.import_source ? "Pazaryeri siparişi pazaryerinden iptal edilir"
      : shippedNow ? "Kargolanmış sipariş iptal edilemez — \"İade al\" kullanın"
      : null;
    if (blocked) return NextResponse.json({ error: blocked }, { status: 400 });
    if (paid && remaining > 0) {
      const err = await doRefund(remaining, String(body.method || ""), body.note);
      if (err) return NextResponse.json({ error: `Ücret iadesi yapılamadı: ${err}` }, { status: 400 });
    }
    const { error } = await sb.rpc("order_mark_cancelled", { p_order: orderId, p_note: body.note || null, p_actor: user.id });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
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
    // Değişimde geri gelen (tutulmayan) ürün → değişim tamam, sipariş "oldu" (fatura sırası).
    const { data: openCase } = await sb.from("order_cases").select("id, kind, status").eq("order_id", orderId).is("closed_at", null).maybeSingle();
    if (openCase) {
      const done = new Date().toISOString();
      const exchangeDone = openCase.kind === "exchange" && ["keep_chosen", "label_sent"].includes(openCase.status);
      if (openCase.kind === "return" || exchangeDone) {
        await sb.from("order_cases").update({ status: exchangeDone ? "resolved" : "received", closed_at: done, updated_at: done }).eq("id", openCase.id);
        if (exchangeDone) await sb.from("orders").update({ fit_status: "ok" }).eq("id", orderId);
      }
    }
    if (body.refund && Number(body.refund.amount) > 0) {
      const err = await doRefund(Number(body.refund.amount), String(body.refund.method || ""), body.refund.note || body.note);
      if (err) return NextResponse.json({ error: `İade kaydedildi ama ücret iadesi yapılamadı: ${err}` }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
  }

  const { data: fresh } = await sb.from("orders")
    .select("id, status, payment_status, shipment_status, invoice_status, refunded_amount, refund_status, refund_method")
    .eq("id", orderId).maybeSingle();
  return NextResponse.json({ ok: true, order: fresh });
}
