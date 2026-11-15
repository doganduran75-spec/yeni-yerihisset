/* eslint-disable @typescript-eslint/no-explicit-any */
// "PAKET HAZIR" AKIŞI (kullanıcı kararları 2026-10-24). Yalnız yönetici.
//   POST { op: "packed", orderId }      → paket hazır (packed_at). Trendyol / Hepsiburada: Paraşüt faturası hemen kesilir;
//                                         bitince (cron) pazaryerine yüklenir, Trendyol paketi "İşleme al" yapılır.
//                                         Site: "Kargo bekliyor" + fatura da bu anda kesilir (kullanıcı 2026-11-14, C2: fatura
//                                         sevkiyatta; eskiden müşteri "oldu" deyince). Müşteriye e-posta GİTMEZ (gece
//                                         paketlenebilir) — fatura PDF'i "Kargoya verildi" e-postasının ekinde gider.
//   POST { op: "label_printed", orderId, code } → Basit Kargo etiketi basıldı: kod kaydı + (kargo hazırlandıysa) fatura.
//   POST { op: "picked_up", ids }     → kurye aldı (site): Kargoda + kargo e-postası (takip numarasıyla) o an.
//   POST { op: "mp_picking", orderId }  → Trendyol "İşleme al" yeniden dene.
//   POST { op: "hb_package", orderId }  → Hepsiburada paketlemeyi yeniden dene.
//   POST { op: "mp_claim", orderId, restock } → Trendyol iadesini onayla + işle (src/lib/marketplace/trendyol-claims.ts).
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { invoiceOrder, autoInvoiceSiteOrder, invoiceIfPacked } from "@/lib/parasut-invoice";
import { parasutConfig } from "@/lib/parasut";
import { trendyolPicking } from "@/lib/marketplace-invoice";
import { hbPackageOrder } from "@/lib/marketplace/hb-package";
import { receiveTrendyolClaim } from "@/lib/marketplace/trendyol-claims";
import { markPickedUp } from "@/lib/order-ship-events";

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
    if (o.status === "cancelled" || SHIPPED.includes(o.shipment_status || ""))
      return NextResponse.json({ error: "Bu sipariş için paket hazırlanamaz (iptal ya da zaten kargolanmış)" }, { status: 400 });
    // Eski siteden aktarılan (yerihisset / attipas) sipariş de site akışıyla hazırlanır (kullanıcı 2026-10-31: panel
    // "Paket hazır" gösteriyor ama reddediliyordu) — pazaryeri gibi paketlemede otomatik fatura yok.
    const site = (o.channel || "site") === "site" || !!o.import_source;
    if (site && !["paid", "partial_refund"].includes(o.payment_status || ""))
      return NextResponse.json({ error: "Ödemesi alınmamış sipariş hazırlanamaz — önce “Ödeme alındı”." }, { status: 400 });
    if (!o.packed_at) {
      await sb.from("orders").update({ packed_at: now }).eq("id", orderId);
      await note(orderId, site ? "Paket hazır — kurye bekleniyor" : "Paket hazır");
    }
    // Hepsiburada: önce PAKETLE (paket no + kargo barkodu; fatura bağlantısı paket numarasına yüklenir)
    let hbPackage: { packageNumber?: string | null; tracking?: string | null; error?: string } | null = null;
    if (o.channel === "hepsiburada") {
      try { hbPackage = await hbPackageOrder(sb, orderId); }
      catch (e: any) { hbPackage = { error: String(e?.message || e) }; await note(orderId, `Hepsiburada paketleme yapılamadı: ${hbPackage.error}`.slice(0, 400)); }
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
    // Site siparişi (+ Paraşüt'e geçişten sonraki eski site siparişi — autoInvoiceHere): fatura paket hazır anında
    // (Paraşüt kapalı / hata → sipariş ekranında "kes / yeniden dene")
    if (site) invoice = await autoInvoiceSiteOrder(sb, orderId, "paket hazır");
    return NextResponse.json({ ok: true, packed_at: o.packed_at || now, invoice, hbPackage });
  }
  // Basit Kargo resmî etiketi basıldı (src/lib/basit-label-print.ts): kod kaydedilir → tetikleyici (MIG 20261165) siparişi
  // "Kargo hazırlandı" yapar → fatura da o an (kullanıcı 2026-11-15: etiketle hazırlanan site siparişi faturasız kalıyordu)
  if (body.op === "label_printed") {
    const orderId = String(body.orderId || "");
    const code = String(body.code || "").trim();
    if (!orderId || !code) return NextResponse.json({ error: "Eksik bilgi" }, { status: 400 });
    const printedAt = new Date().toISOString();
    const { error } = await sb.from("orders").update({ label_printed_code: code, label_printed_at: printedAt }).eq("id", orderId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const invoice = await invoiceIfPacked(sb, orderId, "etiket basıldı");
    return NextResponse.json({ ok: true, printedAt, invoice });
  }

  if (body.op === "picked_up") {
    const ids: string[] = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((s: string) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 200);
    if (!ids.length) return NextResponse.json({ error: "Sipariş seçilmedi" }, { status: 400 });
    const { data: rows } = await sb.from("orders").select("id, channel, import_source, status, shipment_status, packed_at").in("id", ids);
    const shipped: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const o of (rows as any[]) || []) {
      if ((o.channel || "site") !== "site" && !o.import_source) { skipped.push({ id: o.id, reason: "pazaryeri" }); continue; }
      if (!o.packed_at || o.status === "cancelled" || SHIPPED.includes(o.shipment_status || "")) { skipped.push({ id: o.id, reason: "paket hazır değil ya da zaten kargoda" }); continue; }
      // Ortak kural (kargo entegrasyonunun "kargoda" bildirimiyle aynı): src/lib/order-ship-events.ts
      const r = await markPickedUp(sb, o.id, "Kurye aldı — sipariş kargoda", user.id);
      if (r.ok) shipped.push(o.id);
      else if (r.reason !== "zaten kargoda") skipped.push({ id: o.id, reason: r.reason || "hata" });
    }
    return NextResponse.json({ ok: true, shipped, skipped });
  }

  if (body.op === "hb_package") {
    try { return NextResponse.json({ ok: true, ...(await hbPackageOrder(sb, String(body.orderId || ""))) }); }
    catch (e: any) { return NextResponse.json({ error: String(e?.message || e) }, { status: 502 }); }
  }

  // Trendyol iadesi: depoya ulaşanı Trendyol'da onayla + iade gelen satır (stok isteğe bağlı) + kısmi ciro düşümü
  if (body.op === "mp_claim") {
    try { return NextResponse.json({ ok: true, ...(await receiveTrendyolClaim(sb, String(body.orderId || ""), body.restock !== false, user.id)) }); }
    catch (e: any) { return NextResponse.json({ error: String(e?.message || e) }, { status: 400 }); }
  }

  if (body.op === "mp_picking") {
    try { return NextResponse.json(await trendyolPicking(sb, String(body.orderId || ""))); }
    catch (e: any) { return NextResponse.json({ error: String(e?.message || e) }, { status: e?.status || 500 }); }
  }

  return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
}
