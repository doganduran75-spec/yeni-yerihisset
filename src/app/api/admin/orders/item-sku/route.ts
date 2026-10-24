/* eslint-disable @typescript-eslint/no-explicit-any */
// Sipariş satırını sitedeki numaraya bağla (sipariş detayındaki "Ürün Kodu" kutusu). POST { itemId, code }
// Eskiden tarayıcıdan doğrudan yazılıyordu; order_items'ta yönetici için yazma kuralı olmadığından değişiklik
// SESSİZCE kaydolmuyordu. Artık sunucuda (yalnız yönetici): kod → SKU ya da barkod (büyük / küçük harf yok sayılır).
// Stoğa dokunmaz (değişimde stok elle — sipariş geçmişine not düşer).
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";

export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const sb = createAdminClient() as any;
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as any;
  const itemId = String(body.itemId || "");
  const code = String(body.code || "").trim().slice(0, 80);
  if (!itemId || !code) return NextResponse.json({ error: "Satır ve kod gerekli" }, { status: 400 });

  const { data: item } = await sb.from("order_items").select("id, order_id, sku, variant_name, stock_applied_at, orders(invoice_status, stock_reduced_at)").eq("id", itemId).maybeSingle();
  if (!item) return NextResponse.json({ error: "Sipariş satırı bulunamadı" }, { status: 404 });
  if (item.orders?.invoice_status === "invoiced") return NextResponse.json({ error: "Fatura kesildiği için ürün kodu değiştirilemez" }, { status: 400 });

  const safe = code.replace(/[%_,()]/g, "");
  const { data: variant } = await sb.from("product_variants")
    .select("id, sku, product_id, products(title), variant_options(value, variant_groups(name))")
    .or(`sku.ilike.${safe},barcode.ilike.${safe}`).limit(1).maybeSingle();
  if (!variant) return NextResponse.json({ error: `"${code}" sitede bulunamadı (SKU ya da barkod) — ürün formunda o numaranın SKU'sunu kontrol et` }, { status: 404 });

  const opt = variant.variant_options;
  const variantName: string = opt?.value && opt?.variant_groups?.name ? `${opt.variant_groups.name}: ${opt.value}` : (opt?.value ?? "");
  const sku = variant.sku || code;
  const { error } = await sb.from("order_items").update({ sku, variant_id: variant.id, product_id: variant.product_id, variant_name: variantName }).eq("id", itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const stockTaken = !!item.orders?.stock_reduced_at || !!item.stock_applied_at;
  const oldLabel = `${item.sku || "—"}${item.variant_name ? ` (${item.variant_name})` : ""}`;
  const newLabel = `${sku}${variantName ? ` (${variantName})` : ""}`;
  await sb.from("order_events").insert({
    order_id: item.order_id, type: "corrected", created_by: user.id,
    note: `Satır değiştirildi: ${oldLabel} → ${newLabel}.${stockTaken ? " Stok otomatik değişmedi — elle düzenlenmeli." : ""}`,
  });
  return NextResponse.json({
    ok: true, stockTaken, oldLabel, newLabel,
    variant: { id: variant.id, product_id: variant.product_id, sku, title: variant.products?.title ?? "", variant_name: variantName },
  });
}
