/* eslint-disable @typescript-eslint/no-explicit-any */
// Ortak kargo etiketi verisi (site + Trendyol + Hepsiburada). Yalnız yönetici.
//   POST { ids: string[], mark?: true }  → etiket satırları; mark → yazdırılan kod kaydedilir (label_printed_code)
//   POST { size: "a5" | "100x150" }       → kâğıt boyutu ayarı  ·  POST { getSize: true } → mevcut boyut
// Etiket her seferinde siparişin GÜNCEL kargo kodundan üretilir; kodu olmayan sipariş atlanır (sebebiyle döner).
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { orderLabel } from "@/lib/order-label";

const SIZES = ["a5", "100x150"];

export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const sb = createAdminClient() as any;
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as any;
  if (body.getSize) {
    const { data: st } = await sb.from("settings").select("label_size").limit(1).maybeSingle();
    return NextResponse.json({ size: st?.label_size || "a5" });
  }
  if (body.size !== undefined) {
    if (!SIZES.includes(body.size)) return NextResponse.json({ error: "Geçersiz boyut" }, { status: 400 });
    const { error } = await sb.from("settings").update({ label_size: body.size }).not("id", "is", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, size: body.size });
  }

  const ids: string[] = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((s: string) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 200);
  if (!ids.length) return NextResponse.json({ error: "Sipariş seçilmedi" }, { status: 400 });

  const [{ data: st }, { data: orders, error }] = await Promise.all([
    sb.from("settings").select("store_name, address, contact_phone, label_size").limit(1).maybeSingle(),
    sb.from("orders")
      .select("id, order_number, channel, external_order_number, created_at, shipping_address, customer_name, customer_phone, cargo_provider, cargo_tracking_number, kargonomi_tracking_code, shipping_method, status, shipment_status, order_items(quantity, sku, variant_name, size_label, title, products(title)), profiles(first_name, last_name, phone)")
      .in("id", ids),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const labels: any[] = [];
  const skipped: { id: string; order: string; reason: string }[] = [];
  for (const id of ids) {
    const o = ((orders as any[]) || []).find((x) => x.id === id);
    if (!o) continue;
    const no = orderLabel(o);
    const code = String(o.cargo_tracking_number || o.kargonomi_tracking_code || "").trim();
    if (!code) { skipped.push({ id, order: no, reason: "kargo kodu yok" }); continue; }
    if (o.status === "cancelled") { skipped.push({ id, order: no, reason: "sipariş iptal" }); continue; }
    let a: any = {};
    try { a = typeof o.shipping_address === "string" ? JSON.parse(o.shipping_address) : (o.shipping_address || {}); } catch { a = { address: String(o.shipping_address || "") }; }
    const name = a.name || o.customer_name || [o.profiles?.first_name, o.profiles?.last_name].filter(Boolean).join(" ");
    labels.push({
      id, order: no, channel: o.channel || "site", date: o.created_at,
      code, carrier: o.cargo_provider || o.shipping_method || "",
      to: {
        name: name || "—",
        company: a.company || "",
        address: a.address || "",
        district: a.district || "",
        city: a.city || "",
        phone: a.phone || o.customer_phone || o.profiles?.phone || "", // varsa görünür
      },
      items: ((o.order_items as any[]) || []).map((i) => ({
        qty: Number(i.quantity) || 1,
        title: i.title || i.products?.title || "Ürün",
        variant: i.size_label || i.variant_name || "",
        sku: i.sku || "",
      })),
    });
  }

  if (body.mark && labels.length) {
    const now = new Date().toISOString();
    for (const l of labels) await sb.from("orders").update({ label_printed_code: l.code, label_printed_at: now }).eq("id", l.id);
  }

  return NextResponse.json({
    size: st?.label_size || "a5",
    sender: { name: st?.store_name || "YeriHisset", address: st?.address || "", phone: st?.contact_phone || "" },
    labels, skipped,
  });
}
