import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";

/* eslint-disable @typescript-eslint/no-explicit-any */

// EŞLEŞMEYEN ESKİ ÜRÜNLER: eski siteden (WooCommerce) aktarılan siparişlerde sitedeki
// bir varyanta bağlanamamış satırlar, MODELE göre gruplu (her model altında eski
// SKU / numara / adet). Ürünü tanımlayınca:
//   * aynı SKU'yu verdiysen → "Yeniden eşleştir" (POST {action:"rematch"})
//   * farklı SKU verdiysen  → eski SKU'ları varyantlara elle bağla (POST {action:"map"})
// Bağlama legacy_sku_map'te kalıcıdır; sonraki aktarımlar da kullanır. Stoğa dokunmaz.

async function requireAdmin(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return { error: NextResponse.json({ error: "Yetkisiz" }, { status: 401 }) };
  const sb = createAdminClient() as any;
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return { error: NextResponse.json({ error: "Yetkisiz" }, { status: 403 }) };
  return { sb, userId: user.id };
}

const normSku = (v: unknown) => String(v ?? "").toUpperCase().replace(/\s+/g, "") || null;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { sb } = auth;

  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("order_items")
      .select("id, sku, barcode, title, size_label, quantity, orders!inner(id, channel, import_source, created_at)")
      .is("product_id", null)
      .not("orders.import_source", "is", null)
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  type Size = { sku: string | null; size: string; qty: number; orders: Set<string> };
  const groups = new Map<string, { model: string; channels: Set<string>; qty: number; orders: Set<string>; last: string; sizes: Map<string, Size> }>();
  for (const r of rows) {
    const model = (r.title || "(adsız ürün)").trim();
    const g = groups.get(model) || { model, channels: new Set(), qty: 0, orders: new Set(), last: "", sizes: new Map() };
    const o = r.orders || {};
    g.channels.add(o.channel || "site");
    g.qty += Number(r.quantity || 0);
    g.orders.add(o.id);
    if (o.created_at > g.last) g.last = o.created_at;
    const key = normSku(r.sku) || `numara:${r.size_label || "?"}`;
    const sz = g.sizes.get(key) || { sku: normSku(r.sku), size: r.size_label || "", qty: 0, orders: new Set() };
    sz.qty += Number(r.quantity || 0);
    sz.orders.add(o.id);
    g.sizes.set(key, sz);
    groups.set(model, g);
  }

  const list = [...groups.values()]
    .map((g) => ({
      model: g.model,
      channels: [...g.channels],
      qty: g.qty,
      orders: g.orders.size,
      last: g.last,
      sizes: [...g.sizes.values()]
        .map((s) => ({ sku: s.sku, size: s.size, qty: s.qty, orders: s.orders.size }))
        .sort((a, b) => a.size.localeCompare(b.size, "tr", { numeric: true })),
    }))
    .sort((a, b) => b.qty - a.qty);

  const { count: mapped } = await sb.from("legacy_sku_map").select("old_sku", { count: "exact", head: true });
  return NextResponse.json({ ok: true, groups: list, totalItems: rows.length, mapped: mapped ?? 0 });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { sb, userId } = auth;
  const body = await req.json().catch(() => ({}));

  if (body.action === "map") {
    const pairs: { old_sku: string; variant_id: string }[] = (Array.isArray(body.pairs) ? body.pairs : [])
      .map((p: any) => ({ old_sku: normSku(p?.old_sku), variant_id: String(p?.variant_id || "") }))
      .filter((p: any) => p.old_sku && /^[0-9a-f-]{36}$/i.test(p.variant_id));
    if (!pairs.length) return NextResponse.json({ error: "Bağlanacak SKU seçilmedi." }, { status: 400 });
    const { error } = await sb.from("legacy_sku_map")
      .upsert(pairs.map((p) => ({ ...p, created_by: userId })), { onConflict: "old_sku" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (body.action !== "rematch") {
    return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
  }

  const { data, error } = await sb.rpc("rematch_order_items");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Üye etiketlerini tazele: eşleşen ürünler + yeni tanımlanan markalar (ör. Attipas) → Marka/Kategori/Numara
  const { data: tags } = await sb.rpc("refresh_member_auto_tags");
  return NextResponse.json({ ok: true, ...(data || {}), tags: tags ?? null });
}
