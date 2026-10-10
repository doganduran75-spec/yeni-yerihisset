import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { rateLimited, clientIp, TOO_MANY } from "@/lib/rate-limit";
import { loadAfterSale, verifyAfterSaleToken, exchangeOptions, validIban } from "@/lib/after-sale";
import { sendAdminCaseEmail, RETURN_METHOD_LABEL } from "@/lib/after-sale-mail";

/* eslint-disable @typescript-eslint/no-explicit-any */

// SATIŞ SONRASI — müşteri tarafı (/deneme-sonucu). Giriş gerekmez: r = imzalı bağlantı (teslim e-postası).
// Üye Hesabım'dan da gelebilir: ?order=<id> + oturum (kendi siparişi).
//   GET  ?r=…                         → sipariş + açık talep
//   GET  ?r=…&options=1&item=…&dir=up|down|same → değişim önerileri
//   POST { r|order, action: "ok" | "exchange" | "return" | "keep", … }
async function resolveOrderId(req: NextRequest, r?: string | null, order?: string | null): Promise<string | null> {
  if (r) return verifyAfterSaleToken(r);
  if (!order) return null;
  const user = await getAuthUserFromRequest(req);
  if (!user) return null;
  const { data } = await (createAdminClient() as any).from("orders").select("id").eq("id", order).eq("user_id", user.id).maybeSingle();
  return data?.id ?? null;
}

export async function GET(req: NextRequest) {
  if (rateLimited("after-sale", clientIp(req), 120, 600000)) return NextResponse.json(TOO_MANY, { status: 429 });
  const sp = new URL(req.url).searchParams;
  const orderId = await resolveOrderId(req, sp.get("r"), sp.get("order"));
  if (!orderId) return NextResponse.json({ error: "Bağlantı geçersiz" }, { status: 400 });
  if (sp.get("options")) {
    const dir = (["up", "down", "same"].includes(sp.get("dir") || "") ? sp.get("dir") : "same") as "up" | "down" | "same";
    const opts = await exchangeOptions(orderId, sp.get("item") || "", dir);
    return opts ? NextResponse.json({ ok: true, ...opts }) : NextResponse.json({ error: "Ürün bulunamadı" }, { status: 404 });
  }
  const view = await loadAfterSale(orderId);
  if (!view) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
  return NextResponse.json({ ok: true, ...view });
}

export async function POST(req: NextRequest) {
  if (rateLimited("after-sale-post", clientIp(req), 30, 600000)) return NextResponse.json(TOO_MANY, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as any;
  const orderId = await resolveOrderId(req, body.r, body.order);
  if (!orderId) return NextResponse.json({ error: "Bağlantı geçersiz" }, { status: 400 });
  const view = await loadAfterSale(orderId);
  if (!view) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
  const sb = createAdminClient() as any;
  const now = new Date().toISOString();
  const note = String(body.note || "").trim().slice(0, 1000) || null;
  const itemById = new Map(view.items.map((i) => [i.id, i]));
  const label = (id: string) => { const i = itemById.get(id); return i ? `${i.title}${i.size ? ` (${i.size})` : ""}` : "?"; };

  // ── Oldu ──
  if (body.action === "ok") {
    if (!view.canAnswer) return NextResponse.json({ error: "Bu sipariş için cevap verilemiyor" }, { status: 400 });
    await sb.from("orders").update({ fit_status: "ok", fit_answered_at: now }).eq("id", orderId);
    await sb.from("order_events").insert({ order_id: orderId, type: "note", note: "Müşteri: ayakkabı oldu 👍" });
    return NextResponse.json({ ok: true, fitStatus: "ok" });
  }

  // ── Değişim ──
  if (body.action === "exchange") {
    if (!view.canAnswer) return NextResponse.json({ error: "Bu sipariş için değişim talebi açılamıyor" }, { status: 400 });
    const reqItems = Array.isArray(body.items) ? body.items : [];
    const items: any[] = [];
    for (const x of reqItems) {
      if (!itemById.has(x.order_item_id)) continue;
      let want: any = null;
      if (x.variant_id) {
        const { data: v } = await sb.from("product_variants").select("id, product_id, stock, is_active, variant_options(value), products(title)").eq("id", x.variant_id).maybeSingle();
        if (!v || v.is_active === false) return NextResponse.json({ error: "Seçilen numara bulunamadı" }, { status: 400 });
        if (Number(v.stock || 0) < 1 && !x.wait) return NextResponse.json({ error: "Seçilen numara az önce tükendi, başka bir seçenek seç" }, { status: 409 });
        want = { want_variant_id: v.id, want_product_id: v.product_id, want_label: `${v.products?.title ?? ""} (${v.variant_options?.value ?? ""})` };
        if (x.wait) {
          // Stok gelince haber ver (müşterinin e-postasıyla)
          const { data: o } = await sb.from("orders").select("user_id").eq("id", orderId).maybeSingle();
          const { data: p } = await sb.from("profiles").select("email").eq("id", o?.user_id).maybeSingle();
          await sb.from("stock_notifications").insert({ product_id: v.product_id, variant_id: v.id, status: "pending", user_id: o?.user_id ?? null, email: p?.email ?? null });
        }
      }
      items.push({ order_item_id: x.order_item_id, wait: !!x.wait, ...(want || {}) });
    }
    if (!items.length) return NextResponse.json({ error: "Değiştirmek istediğin ürünü seç" }, { status: 400 });
    const waiting = items.every((i) => i.wait);
    const { error } = await sb.from("order_cases").insert({ order_id: orderId, kind: "exchange", status: waiting ? "waiting_stock" : "requested", reason: String(body.reason || "").slice(0, 40) || null, customer_note: note, items });
    if (error) return NextResponse.json({ error: "Talebin zaten alınmış olabilir" }, { status: 409 });
    await sb.from("orders").update({ fit_status: "exchange", fit_answered_at: now }).eq("id", orderId);
    sendAdminCaseEmail(orderId, waiting ? "Değişim — müşteri stok bekliyor" : "Değişim talebi", [
      ...items.map((i) => `${escapeLine(label(i.order_item_id))} → <b>${escapeLine(i.want_label || "—")}</b>${i.wait ? " (stok bekliyor)" : ""}`),
      ...(note ? [`Not: ${escapeLine(note)}`] : []),
    ]).catch(() => {});
    return NextResponse.json({ ok: true, fitStatus: "exchange" });
  }

  // ── İade ──
  if (body.action === "return") {
    if (!view.canAnswer) return NextResponse.json({ error: "Bu sipariş için iade talebi açılamıyor" }, { status: 400 });
    const ids: string[] = (Array.isArray(body.items) ? body.items : []).filter((id: string) => itemById.has(id));
    if (!ids.length) return NextResponse.json({ error: "İade etmek istediğin ürünü seç" }, { status: 400 });
    if (!RETURN_METHOD_LABEL[body.method]) return NextResponse.json({ error: "Kargo yöntemini seç" }, { status: 400 });
    let iban: string | null = null;
    if (view.paymentMethod === "bank_transfer") {
      iban = validIban(body.iban);
      if (!iban) return NextResponse.json({ error: "Geçerli bir IBAN gir (TR ile başlayan 26 karakter)" }, { status: 400 });
    }
    const { error } = await sb.from("order_cases").insert({
      order_id: orderId, kind: "return", status: "requested", reason: String(body.reason || "").slice(0, 40) || null,
      customer_note: note, items: ids.map((id) => ({ order_item_id: id })), return_method: body.method, iban,
    });
    if (error) return NextResponse.json({ error: "Talebin zaten alınmış olabilir" }, { status: 409 });
    await sb.from("orders").update({ fit_status: "return", fit_answered_at: now }).eq("id", orderId);
    // "İade edeyim, istediğim numara gelince haber verin"
    if (body.notify_variant_id) {
      const { data: v } = await sb.from("product_variants").select("id, product_id").eq("id", body.notify_variant_id).maybeSingle();
      const { data: o } = await sb.from("orders").select("user_id").eq("id", orderId).maybeSingle();
      const { data: p } = await sb.from("profiles").select("email").eq("id", o?.user_id).maybeSingle();
      if (v) await sb.from("stock_notifications").insert({ product_id: v.product_id, variant_id: v.id, status: "pending", user_id: o?.user_id ?? null, email: p?.email ?? null });
    }
    sendAdminCaseEmail(orderId, "İade talebi", [
      ...ids.map((id) => escapeLine(label(id))),
      `Kargo: <b>${RETURN_METHOD_LABEL[body.method]}</b> → Kargonomi'den etiket oluştur, kodu siparişe gir`,
      ...(note ? [`Not: ${escapeLine(note)}`] : []),
    ]).catch(() => {});
    return NextResponse.json({ ok: true, fitStatus: "return" });
  }

  // ── Değişim sonrası: hangisi oldu? (alternatif teslim edildi) ──
  if (body.action === "keep") {
    const c = view.openCase;
    if (!c || c.kind !== "exchange" || c.status !== "alt_delivered") return NextResponse.json({ error: "Şu an seçim yapılamıyor" }, { status: 400 });
    if (!itemById.has(body.keep_item_id)) return NextResponse.json({ error: "Tuttuğun ürünü seç" }, { status: 400 });
    if (!RETURN_METHOD_LABEL[body.method]) return NextResponse.json({ error: "Diğerini nasıl göndereceğini seç" }, { status: 400 });
    await sb.from("order_cases").update({ status: "keep_chosen", keep_item_id: body.keep_item_id, return_method: body.method, customer_note: note ?? c.customer_note, updated_at: now }).eq("id", c.id);
    sendAdminCaseEmail(orderId, "Değişim — müşteri seçti", [
      `Tuttuğu: <b>${escapeLine(label(body.keep_item_id))}</b>`,
      `Geri gönderecek: ${RETURN_METHOD_LABEL[body.method]} → Kargonomi'den etiket oluştur, kodu siparişe gir`,
    ]).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
}

function escapeLine(s: string) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
