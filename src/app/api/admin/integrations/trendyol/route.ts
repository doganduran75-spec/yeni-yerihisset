import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { getTrendyolConfig, hasCredentials, testConnection } from "@/lib/marketplace/trendyol";
import { processMarketplaceStock, kickMarketplaceSync } from "@/lib/marketplace/sync";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Ayarlar › Entegrasyonlar › Trendyol paneli (yalnız admin, servis-rol).
// GET: durum özeti (kuyruk sayıları, son gönderim, hatalar, barkodsuz varyantlar)
// POST {action}: test | sync (bekleyenleri şimdi gönder) | full (tüm stokları gönder) | retry (hatalıları tekrar dene)

async function requireAdmin(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return { error: NextResponse.json({ error: "Oturum bulunamadı" }, { status: 401 }) };
  const supabase = createAdminClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((profile as any)?.role !== "admin") return { error: NextResponse.json({ error: "Yetkisiz" }, { status: 403 }) };
  return { supabase };
}

async function variantInfo(sb: any, variantIds: string[]) {
  const out: Record<string, { title: string; label: string }> = {};
  if (!variantIds.length) return out;
  const { data } = await sb
    .from("product_variants")
    .select("id, products(title), variant_options(value, variant_groups(name))")
    .in("id", variantIds);
  for (const v of (data as any[]) || []) {
    const val = v.variant_options?.value ?? "";
    const grp = v.variant_options?.variant_groups?.name ?? "";
    out[v.id] = { title: v.products?.title ?? "—", label: val ? (grp ? `${grp}: ${val}` : val) : "" };
  }
  return out;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const sb = auth.supabase as any;

  const cfg = await getTrendyolConfig(auth.supabase);
  const statuses = ["pending", "sending", "sent", "ok", "failed"] as const;
  const counts: Record<string, number> = {};
  await Promise.all(statuses.map(async (s) => {
    const { count } = await sb.from("marketplace_stock_sync").select("id", { count: "exact", head: true })
      .eq("channel", "trendyol").eq("status", s);
    counts[s] = count ?? 0;
  }));

  const [{ data: lastSent }, { data: lastOk }, { data: failures }, { count: noBarcode }, { count: withBarcode }] = await Promise.all([
    sb.from("marketplace_stock_sync").select("sent_at").eq("channel", "trendyol").not("sent_at", "is", null)
      .order("sent_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("marketplace_stock_sync").select("confirmed_at").eq("channel", "trendyol").not("confirmed_at", "is", null)
      .order("confirmed_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("marketplace_stock_sync").select("id, variant_id, barcode, desired_qty, error, attempts, next_attempt_at, updated_at, status")
      .eq("channel", "trendyol").or("status.eq.failed,and(status.eq.pending,attempts.gt.0)")
      .order("updated_at", { ascending: false }).limit(50),
    sb.from("product_variants").select("id", { count: "exact", head: true }).or("barcode.is.null,barcode.eq."),
    sb.from("product_variants").select("id", { count: "exact", head: true }).not("barcode", "is", null).neq("barcode", ""),
  ]);

  const info = await variantInfo(sb, ((failures as any[]) || []).map((f) => f.variant_id));
  return NextResponse.json({
    ok: true,
    config: { enabled: cfg.enabled, hasCredentials: hasCredentials(cfg), stage: cfg.stage },
    counts,
    lastSentAt: lastSent?.sent_at ?? null,
    lastConfirmedAt: lastOk?.confirmed_at ?? null,
    failures: ((failures as any[]) || []).map((f) => ({ ...f, ...(info[f.variant_id] || { title: "—", label: "" }) })),
    variants: { withBarcode: withBarcode ?? 0, withoutBarcode: noBarcode ?? 0 },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const sb = auth.supabase as any;
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  const cfg = await getTrendyolConfig(auth.supabase);

  if (action === "test") {
    if (!hasCredentials(cfg)) return NextResponse.json({ error: "Önce Satıcı ID, API Key ve API Secret'ı girip kaydet." }, { status: 400 });
    try {
      const r = await testConnection(cfg);
      return NextResponse.json({ ok: true, ...r });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Bağlantı başarısız" }, { status: 400 });
    }
  }

  if (action === "full") {
    const { data, error } = await sb.rpc("enqueue_all_marketplace_stock", { p_channel: "trendyol" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const report = await processMarketplaceStock(auth.supabase);
    return NextResponse.json({ ok: true, queued: data ?? 0, ...report });
  }

  if (action === "retry") {
    await sb.from("marketplace_stock_sync")
      .update({ status: "pending", attempts: 0, next_attempt_at: new Date().toISOString(), error: null, updated_at: new Date().toISOString() })
      .eq("channel", "trendyol").eq("status", "failed");
    const report = await processMarketplaceStock(auth.supabase);
    return NextResponse.json({ ok: true, ...report });
  }

  if (action === "kick") {
    // Ürün kaydından sonra: kuyruğu arka planda işle, yanıtı bekletme
    kickMarketplaceSync(500);
    return NextResponse.json({ ok: true });
  }

  if (action === "sync") {
    // Bekleyen (geri sayımdaki dahil) satırları hemen gönder
    await sb.from("marketplace_stock_sync")
      .update({ next_attempt_at: new Date().toISOString() })
      .eq("channel", "trendyol").eq("status", "pending");
    const report = await processMarketplaceStock(auth.supabase);
    return NextResponse.json({ ok: true, ...report });
  }

  return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
}
