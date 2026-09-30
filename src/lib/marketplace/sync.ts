/* eslint-disable @typescript-eslint/no-explicit-any */
// Pazaryeri stok kuyruğu işleyicisi (şimdilik Trendyol).
// Kuyruğu veritabanı tetikleyicisi doldurur (migration 20261003000001):
// varyant stoğu/barkodu nereden değişirse değişsin satır 'pending' olur.
// Bu işleyici:
//   1) 'pending' satırları kilitleyerek alır, barkod+stok olarak Trendyol'a yollar
//      (1000'lik paketler), kabul edilince 'sent' + batchRequestId yazar;
//   2) 'sent' paketlerin sonucunu Trendyol'dan sorar → 'ok' ya da 'failed' (+sebep);
//   3) stok 0 başarıyla gittiyse eski manuel "Pazaryeri Stok Görevi"ni (Trendyol) kapatır.
// Çağıranlar: ürün kaydı / sipariş / iptal (kickMarketplaceSync, anlık) ve
// dakikalık cron (/api/cron/marketplace-sync, yedek).

import { createAdminClient } from "@/lib/supabase-admin";
import { getTrendyolConfig, hasCredentials, updateStocks, getBatchResult, TrendyolError } from "@/lib/marketplace/trendyol";

type AdminClient = ReturnType<typeof createAdminClient>;
const CHANNEL = "trendyol";

export type SyncReport = {
  skipped?: "disabled" | "no_credentials";
  sent: number;
  batches: number;
  confirmed: number;
  failed: number;
  errors: string[];
};

export async function processMarketplaceStock(supabase: AdminClient = createAdminClient()): Promise<SyncReport> {
  const report: SyncReport = { sent: 0, batches: 0, confirmed: 0, failed: 0, errors: [] };
  const cfg = await getTrendyolConfig(supabase);
  if (!cfg.enabled) return { ...report, skipped: "disabled" };
  if (!hasCredentials(cfg)) return { ...report, skipped: "no_credentials" };
  const sb = supabase as any;

  // ── 1) Gönder ──
  for (let round = 0; round < 5; round++) {
    const { data: rows, error } = await sb.rpc("claim_marketplace_stock", { p_channel: CHANNEL, p_limit: 1000 });
    if (error) { report.errors.push(error.message); break; }
    const list = (rows as any[]) || [];
    if (!list.length) break;

    // Aynı barkod iki varyantta olursa tek satır gönder (sonuncusu)
    const byBarcode = new Map<string, number>();
    for (const r of list) byBarcode.set(r.barcode, Number(r.sending_qty ?? r.desired_qty ?? 0));
    const items = [...byBarcode.entries()].map(([barcode, quantity]) => ({ barcode, quantity }));
    const ids = list.map((r) => r.id);

    try {
      const batchId = await updateStocks(cfg, items);
      await sb.rpc("mark_marketplace_stock_sent", { p_ids: ids, p_batch: batchId });
      report.sent += items.length;
      report.batches += 1;
    } catch (e: any) {
      const msg = e?.message || String(e);
      await sb.rpc("mark_marketplace_stock_retry", { p_ids: ids, p_error: msg });
      report.errors.push(msg);
      // Yetki/istek sınırı hatasında diğer paketleri de deneme
      if (e instanceof TrendyolError && [0, 401, 403, 429].includes(e.status)) break;
    }
  }

  // ── 2) Sonuçları doğrula (Trendyol birkaç saniyede işler) ──
  const { data: sentRows } = await sb
    .from("marketplace_stock_sync")
    .select("id, variant_id, barcode, last_sent_qty, batch_request_id, sent_at")
    .eq("channel", CHANNEL)
    .eq("status", "sent")
    .lt("sent_at", new Date(Date.now() - 5000).toISOString())
    .order("sent_at", { ascending: true })
    .limit(3000);
  const byBatch = new Map<string, any[]>();
  for (const r of (sentRows as any[]) || []) {
    if (!r.batch_request_id) continue;
    (byBatch.get(r.batch_request_id) || byBatch.set(r.batch_request_id, []).get(r.batch_request_id)!).push(r);
  }

  const zeroOkVariants: string[] = [];
  for (const [batchId, rows] of [...byBatch.entries()].slice(0, 20)) {
    const oldest = Math.min(...rows.map((r) => new Date(r.sent_at).getTime()));
    let result: Awaited<ReturnType<typeof getBatchResult>> | null = null;
    try {
      result = await getBatchResult(cfg, batchId);
    } catch (e: any) {
      // Sonuç 4 saat saklanır; daha eskiyse doğrulanamadı kabul et (gönderim kabul edilmişti)
      if (Date.now() - oldest > 4 * 3600_000) {
        await sb.from("marketplace_stock_sync")
          .update({ status: "ok", confirmed_at: new Date().toISOString(), error: "Sonuç doğrulanamadı (gönderim kabul edilmişti)" })
          .in("id", rows.map((r) => r.id)).eq("status", "sent").eq("batch_request_id", batchId);
      } else {
        report.errors.push(e?.message || String(e));
      }
      continue;
    }
    if (!result.done) continue;

    const resByBarcode = new Map(result.items.map((i) => [i.barcode, i]));
    const okIds: string[] = [];
    for (const r of rows) {
      const it = resByBarcode.get(r.barcode);
      if (!it || it.ok) {
        okIds.push(r.id);
        if (Number(r.last_sent_qty) === 0) zeroOkVariants.push(r.variant_id);
      } else {
        await sb.from("marketplace_stock_sync")
          .update({ status: "failed", error: it.reason || "Trendyol reddetti", updated_at: new Date().toISOString() })
          .eq("id", r.id).eq("status", "sent").eq("batch_request_id", batchId);
        report.failed += 1;
      }
    }
    if (okIds.length) {
      await sb.from("marketplace_stock_sync")
        .update({ status: "ok", confirmed_at: new Date().toISOString(), error: null })
        .in("id", okIds).eq("status", "sent").eq("batch_request_id", batchId);
      report.confirmed += okIds.length;
    }
  }

  // ── 3) Stok 0 Trendyol'a işlendiyse manuel görevi otomatik kapat ──
  if (zeroOkVariants.length) {
    const { data: ch } = await sb.from("marketplace_channels").select("id").ilike("name", "trendyol").maybeSingle();
    if (ch?.id) {
      await sb.from("stock_sync_tasks")
        .update({ status: "done", method: "api", done_at: new Date().toISOString(), note: "Trendyol API ile otomatik" })
        .eq("channel_id", ch.id).eq("status", "pending").in("variant_id", zeroOkVariants);
    }
  }

  return report;
}

// ── Anlık tetik ──
// Stok değiştiren bir işlemden sonra çağrılır; yanıtı BEKLETMEZ. Art arda gelen
// değişiklikler tek turda gitsin diye kısa gecikme; aynı süreçte aynı anda tek tur.
let running = false;
let again = false;
export function kickMarketplaceSync(delayMs = 1500) {
  setTimeout(async () => {
    if (running) { again = true; return; }
    running = true;
    try {
      let sentBatches = 0;
      do {
        again = false;
        const r = await processMarketplaceStock();
        sentBatches += r.batches;
        if (r.errors.length) console.error("[marketplace-sync]", r.errors.join(" | "));
      } while (again);
      // Gönderim olduysa birkaç saniye sonra sonucu doğrula (cron'u beklemeden)
      if (sentBatches > 0) setTimeout(() => kickMarketplaceSync(0), 8000);
    } catch (e: any) {
      console.error("[marketplace-sync] exception", e?.message || e);
    } finally {
      running = false;
    }
  }, delayMs);
}
