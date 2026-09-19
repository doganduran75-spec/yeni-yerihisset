import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Toplu stok/fiyat/barkod güncelleme — SKU'ya göre eşleştirir (product_variants).
// Yalnız admin. Yalnızca gönderilen alanları günceller.
export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const supabase = createAdminClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((profile as any)?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const { rows } = await req.json() as { rows?: Array<{ sku?: string; stock?: number | null; price?: number | null; barcode?: string | null }> };
  if (!Array.isArray(rows) || rows.length === 0) return NextResponse.json({ error: "Satır yok" }, { status: 400 });

  let updated = 0, notFound = 0;
  const errors: string[] = [];

  for (const r of rows) {
    const sku = (r.sku || "").toString().trim();
    if (!sku) continue;
    const patch: any = {};
    if (r.stock !== undefined && r.stock !== null && !Number.isNaN(Number(r.stock))) patch.stock = Math.max(0, Math.trunc(Number(r.stock)));
    if (r.price !== undefined && r.price !== null && !Number.isNaN(Number(r.price))) patch.price = Number(r.price);
    if (r.barcode !== undefined && r.barcode !== null && String(r.barcode).trim() !== "") patch.barcode = String(r.barcode).trim();
    if (Object.keys(patch).length === 0) continue;

    const { data, error } = await (supabase as any)
      .from("product_variants").update(patch).eq("sku", sku).select("id");
    if (error) { errors.push(`${sku}: ${error.message}`); continue; }
    if (!data || data.length === 0) { notFound++; continue; }
    updated += data.length;
  }

  return NextResponse.json({ ok: true, updated, notFound, errors: errors.slice(0, 10) });
}
