/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { processMarketplaceStock } from "@/lib/marketplace/sync";
import { importMarketplaceOrders } from "@/lib/marketplace/orders";
import { processMarketplacePrices } from "@/lib/marketplace/price-sync";
import { syncMarketplaceListings } from "@/lib/marketplace/listings";
import { evaluateHealthAlerts } from "@/lib/server-health-alerts";
import { pollKargonomi } from "@/lib/kargonomi-flow";
import { pollParasut } from "@/lib/parasut-invoice";
import { pollMarketplaceInvoices } from "@/lib/marketplace-invoice";
import { processGmcQueue } from "@/lib/gmc-sync";
import { processReviewRequests, processWinback } from "@/lib/review-winback";

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
  // 4) Kargonomi: firması seçilmiş, kargo kodu gelmemiş siparişler (kod gelince sipariş "Kargoda" + e-posta)
  const kargo = await pollKargonomi(supabase).catch((e: any) => ({ checked: 0, shipped: 0, errors: [e?.message || String(e)] }));
  if (kargo.errors.length) console.error("[cron/kargonomi]", kargo.errors.join(" | "));
  // 5) Paraşüt: e-Arşiv / e-Fatura işi + PDF bekleyen faturalar (bitince sipariş "Faturalandı")
  const fatura = await pollParasut(supabase).catch((e: any) => ({ checked: 0, done: 0, errors: [e?.message || String(e)] }));
  if (fatura.errors.length) console.error("[cron/parasut]", fatura.errors.join(" | "));
  // 5b) Paraşüt faturası bitmiş Trendyol siparişleri → faturayı Trendyol'a yükle (ilk deneme; hata olursa elle)
  const tyInv = await pollMarketplaceInvoices(supabase).catch((e: any) => ({ sent: 0, errors: [e?.message || String(e)] }));
  if (tyInv.errors.length) console.error("[cron/marketplace-invoice]", tyInv.errors.join(" | "));
  // 6) Google Merchant API: değişen ürünler (besleme günlük tam eşitlemeyi sürdürür)
  const google = await processGmcQueue(supabase).catch((e: any) => ({ products: 0, sent: 0, deleted: 0, failed: 0, skipped: "", errors: [e?.message || String(e)] }));
  if (google.errors.length) console.error("[cron/gmc]", google.errors.slice(0, 5).join(" | "));
  // 7) Saatte bir: yorum isteme + "seni özledik" (src/lib/review-winback.ts; ayarlar Ayarlar › E-posta Şablonları)
  if (new Date().getMinutes() === 23) {
    await processReviewRequests(supabase).catch((e: any) => console.error("[cron/review-request]", e?.message || e));
    await processWinback(supabase).catch((e: any) => console.error("[cron/winback]", e?.message || e));
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
  return NextResponse.json({ ok: true, orders, reports, prices, kargo, fatura, google });
}

export const GET = run;
export const POST = run;
