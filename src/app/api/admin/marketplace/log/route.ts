import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Pazaryeri SENKRON GEÇMİŞİ (marketplace_stock_log): barkod/SKU, pazaryeri, adet,
// sonuç, tarih. Filtre: ?channel=trendyol|hepsiburada &status=ok|fail &q=barkod &page=0
// Yalnız admin. 180 günden eski kayıtları cron siler.

const PAGE = 50;

export async function GET(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const sb = createAdminClient() as any;
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const channel = sp.get("channel");
  const status = sp.get("status");
  const q = (sp.get("q") || "").replace(/[,()*%\\]/g, "").trim();
  const page = Math.max(0, Number(sp.get("page") || 0) || 0);

  let query = sb.from("marketplace_stock_log")
    .select("id, channel, kind, price, variant_id, listing_key, qty, ok, message, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * PAGE, page * PAGE + PAGE - 1);
  if (channel === "trendyol" || channel === "hepsiburada" || channel === "amazon") query = query.eq("channel", channel);
  if (status === "ok") query = query.eq("ok", true);
  if (status === "fail") query = query.eq("ok", false);
  if (q) query = query.ilike("listing_key", `%${q}%`);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Ürün adı + varyant etiketi
  const ids = [...new Set(((data as any[]) || []).map((r) => r.variant_id).filter(Boolean))];
  const info: Record<string, { title: string; label: string }> = {};
  if (ids.length) {
    const { data: vs } = await sb.from("product_variants")
      .select("id, products(title), variant_options(value, variant_groups(name))").in("id", ids);
    for (const v of (vs as any[]) || []) {
      const val = v.variant_options?.value ?? "";
      const grp = v.variant_options?.variant_groups?.name ?? "";
      info[v.id] = { title: v.products?.title ?? "—", label: val ? (grp ? `${grp}: ${val}` : val) : "" };
    }
  }

  return NextResponse.json({
    ok: true,
    total: count ?? 0,
    pageSize: PAGE,
    rows: ((data as any[]) || []).map((r) => ({ ...r, ...(info[r.variant_id] || { title: "—", label: "" }) })),
  });
}
