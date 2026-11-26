/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { processMarketplaceStock } from "@/lib/marketplace/sync";
import { importMarketplaceOrders } from "@/lib/marketplace/orders";
import { syncTrendyolClaims } from "@/lib/marketplace/trendyol-claims";
import { processMarketplacePrices } from "@/lib/marketplace/price-sync";
import { syncMarketplaceListings } from "@/lib/marketplace/listings";
import { evaluateHealthAlerts } from "@/lib/server-health-alerts";
import { pollKargonomi } from "@/lib/kargonomi-flow";
import { pollAltShipments } from "@/lib/exchange-shipping";
import { pollParasut } from "@/lib/parasut-invoice";
import { parasutKeepAlive } from "@/lib/parasut";
import { refreshPending as refreshInboundInvoices } from "@/lib/parasut-inbound";
import { warmImages } from "@/lib/warm-images";
import { pollMarketplaceInvoices } from "@/lib/marketplace-invoice";
import { processGmcQueue } from "@/lib/gmc-sync";
import { processReviewRequests, processWinback } from "@/lib/review-winback";
import { processTrialReminders } from "@/lib/trial-reminder";
import { syncTrendyolQuestions } from "@/lib/marketplace/trendyol-qna";
import { processTelegramOutbox } from "@/lib/telegram";

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
  // SIKLIK (kullanıcı 2026-11-23, boşta yük): sipariş + stok + fiyat + Telegram dakikada bir; diğerleri seyrek.
  // Dakika eşleşmesi: cron dakikada bir çağırır → "m === X" saatte bir, "m % N === X" N dakikada bir demek.
  const now = new Date();
  const m = now.getMinutes();
  const h = now.getUTCHours();
  // 1) Pazaryeri siparişleri → sitedeki stok düşer/iade olur (kuyruğa girer)
  const orders = await importMarketplaceOrders(supabase);
  for (const o of orders) {
    if (o.errors.length) console.error(`[cron/marketplace-orders:${o.channel}]`, o.errors.join(" | "));
  }
  // 1a) Trendyol iade talepleri (kısmi iade sipariş servisinde görünmüyor) → siparişte "İade yolda / depoya ulaştı".
  // 6 saatte bir (kullanıcı: iade zaten 1 günden geç geliyor, hızın yararı yok).
  const claims = h % 6 === 0 && m === 11
    ? await syncTrendyolClaims(supabase).catch((e: any) => ({ fetched: 0, orders: 0, errors: [e?.message || String(e)] }))
    : { fetched: 0, orders: 0, errors: [] as string[] };
  if (claims.errors.length) console.error("[cron/trendyol-claims]", claims.errors.join(" | "));
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
  // 3) Fiyat kuyruğu (yalnız Fiyatlar sayfasından gönderilenler). Gönderim düğmeye basınca ANINDA (pushPrices);
  // burası yalnız doğrulama / tekrar deneme yedeği → 10 dakikada bir (kullanıcı 2026-11-23).
  const prices = m % 10 === 5 ? await processMarketplacePrices(supabase) : [];
  for (const p of prices) {
    if (p.errors.length) console.error(`[cron/marketplace-prices:${p.channel}]`, p.errors.join(" | "));
  }
  // 4) Kargonomi: (a) firması seçilmiş, ETİKET kodu gelmemiş siparişler (pencere kapalıysa kod buradan gelir) +
  // (b) yoldaki gönderilerin durumu (kurye okutunca "Kargoda", teslim) — (b) zaten sipariş başına saatte bir.
  // 5 dakikada bir (dakika 2, 7, 12…; pollKargonomi içindeki panel gönderisi bağlama dakika 7'de çalışır).
  const kargo = m % 5 === 2
    ? await pollKargonomi(supabase).catch((e: any) => ({ checked: 0, shipped: 0, errors: [e?.message || String(e)] }))
    : { checked: 0, shipped: 0, errors: [] as string[] };
  if (kargo.errors.length) console.error("[cron/kargonomi]", kargo.errors.join(" | "));
  // 4a) Değişim gönderileri (talepteki ayrı gönderi, MIG 20261203): kod + teslim → "hangisi oldu?" e-postası
  const alt = m % 5 === 2
    ? await pollAltShipments(supabase).catch((e: any) => ({ checked: 0, errors: [e?.message || String(e)] }))
    : { checked: 0, errors: [] as string[] };
  if (alt.errors.length) console.error("[cron/exchange-shipping]", alt.errors.join(" | "));
  // 5) Paraşüt: e-Arşiv / e-Fatura işi + PDF bekleyen faturalar (bitince sipariş "Faturalandı") — 10 dakikada bir
  const fatura = m % 10 === 2
    ? await pollParasut(supabase).catch((e: any) => ({ checked: 0, done: 0, errors: [e?.message || String(e)] }))
    : { checked: 0, done: 0, errors: [] as string[] };
  if (fatura.errors.length) console.error("[cron/parasut]", fatura.errors.join(" | "));
  // 5a) Paraşüt yeni altyapı: oturum ~30 gün kullanılmazsa düşer → saatte bir bak, 3 günde bir yenile
  if (new Date().getMinutes() === 17) await parasutKeepAlive(supabase).catch((e: any) => console.error("[cron/parasut-keepalive]", e?.message || e));
  // 5a') Gelen e-faturalar: Paraşüt'te elle kaydedilen / reddedilen panelden düşsün (saatte bir; bekleyen yoksa istek yok)
  if (new Date().getMinutes() === 37) await refreshInboundInvoices(supabase).catch((e: any) => console.error("[cron/parasut-inbound]", e?.message || e));
  // Görsel ısıtma (kullanıcı 2026-11-23): yeni yüklenen ana sayfa / ürün görselinin küçük hâli ilk ziyaretçiden önce üretilsin.
  // Beklenmez (arka planda); önbellekteki görseller anında döner.
  if (new Date().getMinutes() === 43) void warmImages().catch((e: any) => console.error("[cron/warm-images]", e?.message || e));
  // 5b) Paraşüt faturası bitmiş Trendyol siparişleri → faturayı Trendyol'a yükle (ilk deneme; hata olursa elle) — 20 dakikada bir
  const tyInv = m % 20 === 4
    ? await pollMarketplaceInvoices(supabase).catch((e: any) => ({ sent: 0, errors: [e?.message || String(e)] }))
    : { sent: 0, errors: [] as string[] };
  if (tyInv.errors.length) console.error("[cron/marketplace-invoice]", tyInv.errors.join(" | "));
  // 6) Google Merchant API: değişen ürünler (besleme günlük tam eşitlemeyi sürdürür) — 30 dakikada bir
  const google = m % 30 === 9
    ? await processGmcQueue(supabase).catch((e: any) => ({ products: 0, sent: 0, deleted: 0, failed: 0, skipped: "", errors: [e?.message || String(e)] }))
    : { products: 0, sent: 0, deleted: 0, failed: 0, skipped: "", errors: [] as string[] };
  if (google.errors.length) console.error("[cron/gmc]", google.errors.slice(0, 5).join(" | "));
  // 6a) Trendyol müşteri soruları (5 dk'da bir; Trendyol bildirim göndermez) → Mesajlar › Trendyol soruları
  if (new Date().getMinutes() % 5 === 1) {
    const qna = await syncTrendyolQuestions(supabase).catch((e: any) => ({ errors: [e?.message || String(e)] }));
    if (qna.errors.length) console.error("[cron/trendyol-qna]", qna.errors.join(" | "));
  }
  // 6b) Telegram bildirimleri (src/lib/telegram.ts). Dakikada bir: müşteri mesajı, iade / değişim talebi, entegrasyon ve
  // site hatası. PAZARYERİ sipariş mesajı 30 dakikada bir toplu (kullanıcı 2026-11-23; site siparişi kickTelegram ile anında).
  const telegram = await processTelegramOutbox(supabase, { holdOrders: m % 30 !== 0 }).catch((e: any) => ({ sent: 0, updated: 0, skipped: 0, errors: [e?.message || String(e)] }));
  if (telegram.errors.length) console.error("[cron/telegram]", telegram.errors.slice(0, 3).join(" | "));
  // 7) Saatte bir: yorum isteme + "seni özledik" (src/lib/review-winback.ts; ayarlar Ayarlar › E-posta Şablonları)
  if (new Date().getMinutes() === 23) {
    await processReviewRequests(supabase).catch((e: any) => console.error("[cron/review-request]", e?.message || e));
    await processWinback(supabase).catch((e: any) => console.error("[cron/winback]", e?.message || e));
    // Teslimden 4 gün sonra "Ayakkabınız oldu mu?" hatırlatması (src/lib/trial-reminder.ts)
    await processTrialReminders(supabase).catch((e: any) => console.error("[cron/trial-reminder]", e?.message || e));
    // 14 günü cevapsız dolan (faturası kesilmiş) siparişler kesinleşir → satış ortaklığı hakedişine girer (MIG 20261178)
    const { error: stErr } = await (supabase as any).rpc("stamp_settled_orders");
    if (stErr) console.error("[cron/settle]", stErr.message);
  }
  // Eski kayıt temizliği günde bir (00:53 UTC = 03:53 TR): stok geçmişi 180 gün, form spam kayıtları (src/lib/bot-guard.ts) 30 gün
  if (h === 0 && m === 53) {
    await (supabase as any).from("marketplace_stock_log")
      .delete().lt("created_at", new Date(Date.now() - 180 * 86400_000).toISOString());
    await (supabase as any).from("bot_blocks")
      .delete().lt("created_at", new Date(Date.now() - 30 * 86400_000).toISOString());
  }
  // Sunucu Sağlığı: "çalışıyorum" kaydı (uzun süre gelmezse dashboard + e-posta uyarır)
  const firstError = [...orders, ...reports, ...prices].flatMap((r: { errors?: string[] }) => r.errors ?? [])[0];
  await (supabase as any).from("cron_heartbeats").upsert({
    name: "marketplace-sync", last_run_at: new Date().toISOString(), ok: !firstError, message: firstError ?? null,
  });
  // Sunucu sağlığı uyarısı yedeği (15 dk'da bir): sağlık betiği durursa da e-posta gitsin
  if (new Date().getMinutes() % 15 === 7) {
    await evaluateHealthAlerts(supabase).catch((e: any) => console.error("[cron/health-alerts]", e?.message || e));
  }
  return NextResponse.json({ ok: true, orders, claims, reports, prices, kargo, fatura, google, telegram });
}

export const GET = run;
export const POST = run;
