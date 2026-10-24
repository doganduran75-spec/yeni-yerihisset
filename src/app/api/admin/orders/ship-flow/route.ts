/* eslint-disable @typescript-eslint/no-explicit-any */
// "PAKET HAZIR" AKIŞI (kullanıcı kararları 2026-10-24). Yalnız yönetici.
//   POST { op: "packed", orderId }      → paket hazır (packed_at). Trendyol / Hepsiburada: Paraşüt faturası hemen kesilir;
//                                         bitince (cron) pazaryerine yüklenir, Trendyol paketi "İşleme al" yapılır.
//                                         Site: yalnız "Kargo bekliyor" — müşteriye e-posta GİTMEZ (gece paketlenebilir).
//   POST { op: "picked_up", ids }       → kurye aldı (site): Kargoda + kargo e-postası (takip numarasıyla) o an.
//   POST { op: "mp_picking", orderId }  → Trendyol "İşleme al" yeniden dene.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { invoiceOrder } from "@/lib/parasut-invoice";
import { parasutConfig } from "@/lib/parasut";
import { trendyolPicking } from "@/lib/marketplace-invoice";
import { sendOrderNotification } from "@/lib/notifications";

const SHIPPED = ["shipped", "delivered", "undelivered", "returned"];

export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const sb = createAdminClient() as any;
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as any;
  const now = new Date().toISOString();
  const note = (orderId: string, t: string) => sb.from("order_events").insert({ order_id: orderId, type: "note", note: t, created_by: user.id });

  if (body.op === "packed") {
    const orderId = String(body.orderId || "");
    const { data: o } = await sb.from("orders")
      .select("id, channel, import_source, status, payment_status, shipment_status, invoice_status, parasut_status, packed_at")
      .eq("id", orderId).maybeSingle();
    if (!o) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
    if (o.import_source || o.status === "cancelled" || SHIPPED.includes(o.shipment_status || ""))
      return NextResponse.json({ error: "Bu sipariş için paket hazırlanamaz (iptal, aktarılmış ya da zaten kargolanmış)" }, { status: 400 });
    const site = (o.channel || "site") === "site";
    if (site && !["paid", "partial_refund"].includes(o.payment_status || ""))
      return NextResponse.json({ error: "Ödemesi alınmamış sipariş hazırlanamaz — önce “Ödeme alındı”." }, { status: 400 });
    if (!o.packed_at) {
      await sb.from("orders").update({ packed_at: now }).eq("id", orderId);
      await note(orderId, site ? "Paket hazır — kurye bekleniyor" : "Paket hazır");
    }
    // Pazaryeri: fatura hemen (hata siparişe yazılır; sipariş ekranında "yeniden dene")
    let invoice: { status?: string; error?: string } | null = null;
    if (!site && (o.invoice_status || "pending") === "pending" && o.parasut_status !== "done") {
      const cfg = await parasutConfig(sb).catch(() => null);
      if (cfg?.enabled) {
        try { invoice = await invoiceOrder(sb, orderId); }
        catch (e: any) { invoice = { status: "error", error: String(e?.message || e) }; }
      } else invoice = { status: "off" };
    }
    return NextResponse.json({ ok: true, packed_at: o.packed_at || now, invoice });
  }

  if (body.op === "picked_up") {
    const ids: string[] = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((s: string) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 200);
    if (!ids.length) return NextResponse.json({ error: "Sipariş seçilmedi" }, { status: 400 });
    const { data: rows } = await sb.from("orders")
      .select("id, user_id, channel, import_source, status, payment_status, shipment_status, packed_at, cargo_tracking_number, kargonomi_tracking_code, cargo_provider")
      .in("id", ids);
    const shipped: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const o of (rows as any[]) || []) {
      if ((o.channel || "site") !== "site" || o.import_source) { skipped.push({ id: o.id, reason: "pazaryeri / aktarılmış" }); continue; }
      if (!o.packed_at || o.status === "cancelled" || SHIPPED.includes(o.shipment_status || "")) { skipped.push({ id: o.id, reason: "paket hazır değil ya da zaten kargoda" }); continue; }
      // Koşullu güncelleme: aynı anda iki tıklamada e-posta bir kez
      const { data: done, error } = await sb.from("orders").update({ shipment_status: "shipped" })
        .eq("id", o.id).not("shipment_status", "in", `(${SHIPPED.join(",")})`).select("id");
      if (error) { skipped.push({ id: o.id, reason: /PAYMENT_REQUIRED/.test(error.message) ? "ödeme alınmamış" : error.message }); continue; }
      if (!done?.length) continue;
      shipped.push(o.id);
      await note(o.id, "Kurye aldı — sipariş kargoda");
      const code = o.cargo_tracking_number || o.kargonomi_tracking_code;
      await sendOrderNotification("order_shipped", { orderId: o.id, userId: o.user_id, ...(code ? { trackingNumber: o.cargo_provider ? `${code} (${o.cargo_provider})` : code } : {}) })
        .catch((e: any) => console.error("[ship-flow] kargo e-postası", e?.message || e));
    }
    return NextResponse.json({ ok: true, shipped, skipped });
  }

  if (body.op === "mp_picking") {
    try { return NextResponse.json(await trendyolPicking(sb, String(body.orderId || ""))); }
    catch (e: any) { return NextResponse.json({ error: String(e?.message || e) }, { status: e?.status || 500 }); }
  }

  return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
}
