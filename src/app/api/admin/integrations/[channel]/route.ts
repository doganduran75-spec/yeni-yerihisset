import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { processChannel, kickMarketplaceSync, testChannel, isChannel, type Channel } from "@/lib/marketplace/sync";
import { getTrendyolConfig, hasCredentials } from "@/lib/marketplace/trendyol";
import { getHepsiburadaConfig, hbHasCredentials } from "@/lib/marketplace/hepsiburada";
import { importTrendyolOrders } from "@/lib/marketplace/orders";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Ayarlar › Entegrasyonlar › <kanal> paneli (trendyol | hepsiburada). Yalnız admin, servis-rol.
// GET: durum özeti (kuyruk sayıları, son gönderim/doğrulama, sorunlu kayıtlar, eşleşme kapsamı)
// POST {action}: test | kick (arka planda işle) | sync (bekleyenleri şimdi gönder) | full (tümünü gönder) | retry
//              | orders_toggle {on} (sipariş çekmeyi aç/kapat) | orders_pull (siparişleri şimdi çek)

type Ctx = { params: Promise<{ channel: string }> };

async function requireAdmin(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return { error: NextResponse.json({ error: "Oturum bulunamadı" }, { status: 401 }) };
  const supabase = createAdminClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((profile as any)?.role !== "admin") return { error: NextResponse.json({ error: "Yetkisiz" }, { status: 403 }) };
  return { supabase };
}

async function loadConfig(sb: any, channel: Channel) {
  if (channel === "trendyol") {
    const c = await getTrendyolConfig(sb);
    return { enabled: c.enabled, hasCredentials: hasCredentials(c), stage: c.stage, matchField: "barcode" as const };
  }
  const c = await getHepsiburadaConfig(sb);
  return { enabled: c.enabled, hasCredentials: hbHasCredentials(c), stage: c.stage, matchField: c.matchField };
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

export async function GET(req: NextRequest, { params }: Ctx) {
  const { channel } = await params;
  if (!isChannel(channel)) return NextResponse.json({ error: "Bilinmeyen kanal" }, { status: 404 });
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const sb = auth.supabase as any;

  const cfg = await loadConfig(sb, channel);
  const statuses = ["pending", "sending", "sent", "ok", "failed"] as const;
  const counts: Record<string, number> = {};
  await Promise.all(statuses.map(async (s) => {
    const { count } = await sb.from("marketplace_stock_sync").select("id", { count: "exact", head: true })
      .eq("channel", channel).eq("status", s);
    counts[s] = count ?? 0;
  }));

  // Eşleşme kapsamı: bu kanalın anahtar alanı (barkod / SKU) dolu olan ve olmayan varyant sayısı
  const field = cfg.matchField === "sku" ? "sku" : "barcode";
  const [{ data: lastSent }, { data: lastOk }, { data: failures }, { count: missing }, { count: withKey }] = await Promise.all([
    sb.from("marketplace_stock_sync").select("sent_at").eq("channel", channel).not("sent_at", "is", null)
      .order("sent_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("marketplace_stock_sync").select("confirmed_at").eq("channel", channel).not("confirmed_at", "is", null)
      .order("confirmed_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("marketplace_stock_sync").select("id, variant_id, barcode, desired_qty, error, attempts, next_attempt_at, updated_at, status")
      .eq("channel", channel).or("status.eq.failed,and(status.eq.pending,attempts.gt.0)")
      .order("updated_at", { ascending: false }).limit(50),
    sb.from("product_variants").select("id", { count: "exact", head: true }).or(`${field}.is.null,${field}.eq.`),
    sb.from("product_variants").select("id", { count: "exact", head: true }).not(field, "is", null).neq(field, ""),
  ]);

  const info = await variantInfo(sb, ((failures as any[]) || []).map((f) => f.variant_id));

  // Sipariş çekme durumu
  const [{ data: ost }, { data: osync }, { count: ordersCount }, { count: warnCount }] = await Promise.all([
    sb.from("settings").select(`${channel}_orders_enabled, ${channel}_orders_since`).order("id").limit(1).maybeSingle(),
    sb.from("marketplace_order_sync").select("*").eq("channel", channel).maybeSingle(),
    sb.from("orders").select("id", { count: "exact", head: true }).eq("channel", channel),
    sb.from("orders").select("id", { count: "exact", head: true }).eq("channel", channel).not("mp_warning", "is", null).eq("mp_warning_ack", false),
  ]);
  const orders = {
    supported: channel === "trendyol",
    enabled: !!ost?.[`${channel}_orders_enabled`],
    since: ost?.[`${channel}_orders_since`] ?? null,
    lastRunAt: osync?.last_run_at ?? null,
    lastOkAt: osync?.last_ok_at ?? null,
    lastError: osync?.last_error ?? null,
    total: ordersCount ?? 0,
    warnings: warnCount ?? 0,
  };

  return NextResponse.json({
    orders,
    ok: true,
    config: cfg,
    counts,
    lastSentAt: lastSent?.sent_at ?? null,
    lastConfirmedAt: lastOk?.confirmed_at ?? null,
    failures: ((failures as any[]) || []).map((f) => ({ ...f, ...(info[f.variant_id] || { title: "—", label: "" }) })),
    variants: { withKey: withKey ?? 0, withoutKey: missing ?? 0, keyField: field },
  });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { channel } = await params;
  if (!isChannel(channel)) return NextResponse.json({ error: "Bilinmeyen kanal" }, { status: 404 });
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const sb = auth.supabase as any;
  const body = (await req.json().catch(() => ({}))) as { action?: string; on?: boolean };
  const { action } = body;

  if (action === "test") {
    try {
      const r = await testChannel(channel, auth.supabase);
      return NextResponse.json({ ok: true, ...r });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Bağlantı başarısız" }, { status: 400 });
    }
  }

  if (action === "orders_toggle") {
    if (channel !== "trendyol") return NextResponse.json({ error: "Bu kanal için sipariş aktarımı henüz hazır değil." }, { status: 400 });
    const on = !!body.on;
    const { data: cur } = await sb.from("settings").select("id, trendyol_orders_since").order("id").limit(1).maybeSingle();
    const patch: Record<string, unknown> = { trendyol_orders_enabled: on };
    // İlk açılışta başlangıç anı: bu andan ÖNCEKİ siparişler aktarılmaz (stoğu zaten elle düşülmüştü)
    if (on && !cur?.trendyol_orders_since) patch.trendyol_orders_since = new Date().toISOString();
    const { error } = await sb.from("settings").update(patch).not("id", "is", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, since: patch.trendyol_orders_since ?? cur?.trendyol_orders_since ?? null });
  }

  if (action === "orders_pull") {
    if (channel !== "trendyol") return NextResponse.json({ error: "Bu kanal için sipariş aktarımı henüz hazır değil." }, { status: 400 });
    const r = await importTrendyolOrders(auth.supabase);
    return NextResponse.json({ ok: true, ...r });
  }

  if (action === "kick") {
    // Ürün kaydından sonra: TÜM kanalların kuyruğunu arka planda işle, yanıtı bekletme
    kickMarketplaceSync(500);
    return NextResponse.json({ ok: true });
  }

  if (action === "full") {
    const { data, error } = await sb.rpc("enqueue_all_marketplace_stock", { p_channel: channel });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const report = await processChannel(channel, auth.supabase);
    return NextResponse.json({ ok: true, queued: data ?? 0, ...report });
  }

  if (action === "retry") {
    await sb.from("marketplace_stock_sync")
      .update({ status: "pending", attempts: 0, next_attempt_at: new Date().toISOString(), error: null, updated_at: new Date().toISOString() })
      .eq("channel", channel).eq("status", "failed");
    const report = await processChannel(channel, auth.supabase);
    return NextResponse.json({ ok: true, ...report });
  }

  if (action === "sync") {
    // Bekleyen (geri sayımdaki dahil) satırları hemen gönder
    await sb.from("marketplace_stock_sync")
      .update({ next_attempt_at: new Date().toISOString() })
      .eq("channel", channel).eq("status", "pending");
    const report = await processChannel(channel, auth.supabase);
    return NextResponse.json({ ok: true, ...report });
  }

  return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
}
