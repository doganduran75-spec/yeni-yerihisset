/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { processMarketplaceStock } from "@/lib/marketplace/sync";
import { importMarketplaceOrders } from "@/lib/marketplace/orders";
import { processMarketplacePrices } from "@/lib/marketplace/price-sync";
import { syncMarketplaceListings } from "@/lib/marketplace/listings";
import { evaluateHealthAlerts } from "@/lib/server-health-alerts";

// Pazaryeri SİPARİŞLERİ (önce: yeni siparişleri al, iptallerde stoğu geri ekle) +
// stok kuyruğu (Trendyol + Hepsiburada) — YEDEK tetik: anlık tetik
// kaçarsa gönderir, başarısızları bekleyerek tekrar dener, sonuçları doğrular.
// Sistem cron'u DAKİKADA BİR çağırır; yalnız x-cron-secret başlığıyla.
// Ayrıca senkron geçmişinin 180 günden eskisini siler.
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  const supabase = createAdminClient();
  // 1) Pazaryeri siparişleri → sitedeki stok düşer/iade olur (kuyruğa girer)
  const orders = await importMarketplaceOrders(supabase);
  for (const o of orders) {
    if (o.errors.length) console.error(`[cron/marketplace-orders:${o.channel}]`, o.errors.join(" | "));
  }
  // 1b) İlan eşitleme (saatte bir): stok/fiyat yalnız o kanalda ilanı olan ürüne gider
  try {
    const ls = await syncMarketplaceListings(supabase);
    for (const l of ls) if (!l.ok && !l.skipped) console.error(`[cron/marketplace-listings:${l.channel}]`, l.message);
  } catch (e: any) {
    console.error("[cron/marketplace-listings]", e?.message || e);
  }
  // 2) Stok kuyruğu → pazaryerlerine gönder
  const reports = await processMarketplaceStock(supabase);
  for (const r of reports) {
    if (r.errors.length) console.error(`[cron/marketplace-sync:${r.channel}]`, r.errors.join(" | "));
  }
  // 3) Fiyat kuyruğu (yalnız Fiyatlar sayfasından gönderilenler) → gönder / doğrula / tekrar dene
  const prices = await processMarketplacePrices(supabase);
  for (const p of prices) {
    if (p.errors.length) console.error(`[cron/marketplace-prices:${p.channel}]`, p.errors.join(" | "));
  }
  await (supabase as any).from("marketplace_stock_log")
    .delete().lt("created_at", new Date(Date.now() - 180 * 86400_000).toISOString());
  // Form spam koruması kayıtları (src/lib/bot-guard.ts): 30 günden eskiler
  await (supabase as any).from("bot_blocks")
    .delete().lt("created_at", new Date(Date.now() - 30 * 86400_000).toISOString());
  // Sunucu Sağlığı: "çalışıyorum" kaydı (uzun süre gelmezse dashboard + e-posta uyarır)
  const firstError = [...orders, ...reports, ...prices].flatMap((r: { errors?: string[] }) => r.errors ?? [])[0];
  await (supabase as any).from("cron_heartbeats").upsert({
    name: "marketplace-sync", last_run_at: new Date().toISOString(), ok: !firstError, message: firstError ?? null,
  });
  // Sunucu sağlığı uyarısı yedeği (15 dk'da bir): sağlık betiği durursa da e-posta gitsin
  if (new Date().getMinutes() % 15 === 7) {
    await evaluateHealthAlerts(supabase).catch((e: any) => console.error("[cron/health-alerts]", e?.message || e));
  }
  return NextResponse.json({ ok: true, orders, reports, prices });
}

export const GET = run;
export const POST = run;
