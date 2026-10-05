/* eslint-disable @typescript-eslint/no-explicit-any */
// Pazaryeri stok kuyruğu işleyicisi — Trendyol + Hepsiburada + Amazon.
// Kuyruğu veritabanı tetikleyicisi doldurur (migration 20261003000001 + 20261004000001):
// varyant stoğu/barkodu/SKU'su nereden değişirse değişsin, her kanal için satır 'pending' olur.
// Kanal başına bu işleyici:
//   1) 'pending' satırları kilitleyerek alır, kanala paket halinde yollar
//      (kabul edilince 'sent' + yükleme id'si + paket içi sıra yazar);
//   2) 'sent' paketlerin sonucunu kanaldan sorar → 'ok' / 'failed' (+sebep) ve
//      her kesin sonucu SENKRON GEÇMİŞİ'ne (marketplace_stock_log) yazar;
//   3) stok 0 başarıyla gittiyse o kanalın manuel "Pazaryeri Stok Görevi"ni kapatır.
// Amazon sonucu gönderim yanıtında HEMEN döndürür (SKU başına istek, ayrı sonuç sorgusu yok) →
// gönderimden hemen sonra kesinleştirilir; istek sınırına takılanlar 40 sn sonra tekrar gider.
// Çağıranlar: ürün kaydı / sipariş / iptal (kickMarketplaceSync, anlık) ve
// dakikalık cron (/api/cron/marketplace-sync, yedek).

import { createAdminClient } from "@/lib/supabase-admin";
import { getTrendyolConfig, hasCredentials, updateStocks, getBatchResult, testConnection, TrendyolError } from "@/lib/marketplace/trendyol";
import { getHepsiburadaConfig, hbHasCredentials, hbUpdateStocks, hbGetUploadResult, hbTestConnection, HepsiburadaError } from "@/lib/marketplace/hepsiburada";
import { getAmazonConfig, amzHasCredentials, amzUpdateStocks, amzTestConnection, AmazonError, type AmazonStockResult } from "@/lib/marketplace/amazon";

type AdminClient = ReturnType<typeof createAdminClient>;
export type Channel = "trendyol" | "hepsiburada" | "amazon";
export const CHANNELS: Channel[] = ["trendyol", "hepsiburada", "amazon"];

type SentRow = { id: string; variant_id: string; product_id: string | null; barcode: string; last_sent_qty: number; batch_pos: number | null; sent_at: string };

type Adapter = {
  channel: Channel;
  label: string;          // marketplace_channels.name ile aynı
  maxBatch: number;
  maxInFlight: number;    // aynı anda bekleyen (sonucu gelmemiş) yükleme sınırı
  maxRounds?: number;     // bir çalıştırmada en çok kaç paket (varsayılan 5)
  load(sb: AdminClient): Promise<{ enabled: boolean; ready: boolean; cfg: any }>;
  /** Yükleme id'si (sonuç sonra sorulur) ya da eşzamanlı sonuç (anahtar → sonuç) */
  send(cfg: any, items: { key: string; qty: number }[]): Promise<string | { batchId: string; results: Map<string, AmazonStockResult> }>;
  /** Sonuç: done=false → henüz işleniyor. failures: satır id → sebep */
  result(cfg: any, batchId: string, rows: SentRow[]): Promise<{ done: boolean; failures: Map<string, string> }>;
  test(cfg: any): Promise<{ totalProducts: number | null; [k: string]: unknown }>;
  isFatal(e: unknown): boolean; // bu hatada kalan paketleri gönderme
};

const trendyol: Adapter = {
  channel: "trendyol",
  label: "Trendyol",
  maxBatch: 1000,
  maxInFlight: 50,
  async load(sb) { const cfg = await getTrendyolConfig(sb); return { enabled: cfg.enabled, ready: hasCredentials(cfg), cfg }; },
  send: (cfg, items) => updateStocks(cfg, items.map((i) => ({ barcode: i.key, quantity: i.qty }))),
  async result(cfg, batchId, rows) {
    const r = await getBatchResult(cfg, batchId);
    const failures = new Map<string, string>();
    if (!r.done) return { done: false, failures };
    const byKey = new Map(r.items.map((i) => [i.barcode, i]));
    for (const row of rows) {
      const it = byKey.get(row.barcode);
      if (it && !it.ok) failures.set(row.id, it.reason || "Trendyol reddetti");
    }
    return { done: true, failures };
  },
  test: (cfg) => testConnection(cfg),
  isFatal: (e) => e instanceof TrendyolError && [0, 401, 403, 429].includes(e.status),
};

const hepsiburada: Adapter = {
  channel: "hepsiburada",
  label: "Hepsiburada",
  maxBatch: 4000,
  maxInFlight: 4, // Hepsiburada: aynı anda en çok 5 bekleyen yükleme
  async load(sb) { const cfg = await getHepsiburadaConfig(sb); return { enabled: cfg.enabled, ready: hbHasCredentials(cfg), cfg }; },
  send: (cfg, items) => hbUpdateStocks(cfg, items),
  async result(cfg, batchId, rows) {
    const r = await hbGetUploadResult(cfg, batchId);
    const failures = new Map<string, string>();
    if (!r.done) return { done: false, failures };
    if (r.failedAll) { for (const row of rows) failures.set(row.id, r.failedAll); return { done: true, failures }; }
    for (const e of r.errors) {
      for (const row of rows) {
        if ((e.pos != null && row.batch_pos === e.pos) || (e.key && row.barcode === e.key)) failures.set(row.id, e.reason);
      }
    }
    return { done: true, failures };
  },
  test: (cfg) => hbTestConnection(cfg),
  isFatal: (e) => e instanceof HepsiburadaError && [0, 401, 403, 429].includes(e.status),
};

const amazon: Adapter = {
  channel: "amazon",
  label: "Amazon",
  maxBatch: 50,           // SKU başına istek, saniyede ~4 → paket ≈ 13 sn
  maxInFlight: 1000,      // eşzamanlı sonuç → bekleyen yükleme olmaz
  maxRounds: 3,           // çalıştırma başına en çok 150 SKU
  async load(sb) { const cfg = await getAmazonConfig(sb); return { enabled: cfg.enabled, ready: amzHasCredentials(cfg), cfg }; },
  async send(cfg, items) {
    const results = await amzUpdateStocks(cfg, items);
    return { batchId: `az-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, results };
  },
  // Sonuç gönderimde kesinleşir; buraya yalnız yarıda kalmış (çöken işleyici) satırlar düşer
  async result() { return { done: true, failures: new Map<string, string>() }; },
  test: (cfg) => amzTestConnection(cfg),
  isFatal: (e) => e instanceof AmazonError && [0, 401, 403, 429].includes(e.status),
};

const ADAPTERS: Record<Channel, Adapter> = { trendyol, hepsiburada, amazon };
export const channelLabel = (c: Channel) => ADAPTERS[c].label;
export const isChannel = (c: string): c is Channel => (CHANNELS as string[]).includes(c);

export async function testChannel(channel: Channel, sb: AdminClient = createAdminClient()) {
  const a = ADAPTERS[channel];
  const { ready, cfg } = await a.load(sb);
  if (!ready) throw new Error("Önce bağlantı bilgilerini girip kaydet.");
  return a.test(cfg);
}

export type SyncReport = {
  channel: Channel;
  skipped?: "disabled" | "no_credentials";
  sent: number;
  batches: number;
  confirmed: number;
  failed: number;
  errors: string[];
};

async function writeLog(sb: any, channel: Channel, rows: any[], ok: boolean, reasonOf: (r: any) => string | null, batchId: string | null) {
  if (!rows.length) return;
  await sb.from("marketplace_stock_log").insert(rows.map((r) => ({
    channel, variant_id: r.variant_id, product_id: r.product_id ?? null, listing_key: r.barcode,
    qty: Number(r.last_sent_qty ?? r.desired_qty ?? 0), ok, message: reasonOf(r), batch_request_id: batchId,
  })));
}

// Eşzamanlı sonuç (Amazon): gönderilen satırları hemen ok / hatalı / "biraz sonra tekrar" yap
async function settleImmediate(
  sb: any, channel: Channel, batchId: string, results: Map<string, AmazonStockResult>, report: SyncReport, zeroOkVariants: string[],
) {
  const { data } = await sb.from("marketplace_stock_sync")
    .select("id, variant_id, product_id, barcode, last_sent_qty")
    .eq("channel", channel).eq("batch_request_id", batchId).eq("status", "sent");
  const rows = (data as any[]) || [];
  const now = new Date().toISOString();
  const okRows: any[] = [], badRows: any[] = [];
  for (const r of rows) {
    const res = results.get(r.barcode);
    if (res?.ok) { okRows.push(r); continue; }
    if (res?.retry) {
      await sb.from("marketplace_stock_sync")
        .update({ status: "pending", next_attempt_at: new Date(Date.now() + 40_000).toISOString(), error: res.reason ?? null, updated_at: now })
        .eq("id", r.id).eq("status", "sent");
      continue;
    }
    badRows.push({ ...r, _reason: res?.reason || "Sonuç dönmedi (ürün kanalda yok olabilir)" });
  }
  for (const r of badRows) {
    await sb.from("marketplace_stock_sync")
      .update({ status: "failed", error: r._reason, updated_at: now })
      .eq("id", r.id).eq("status", "sent").eq("batch_request_id", batchId);
  }
  if (okRows.length) {
    await sb.from("marketplace_stock_sync")
      .update({ status: "ok", confirmed_at: now, error: null })
      .in("id", okRows.map((r) => r.id)).eq("status", "sent").eq("batch_request_id", batchId);
    for (const r of okRows) if (Number(r.last_sent_qty) === 0) zeroOkVariants.push(r.variant_id);
  }
  await writeLog(sb, channel, okRows, true, () => null, batchId);
  await writeLog(sb, channel, badRows, false, (r) => r._reason, batchId);
  report.confirmed += okRows.length;
  report.failed += badRows.length;
}

export async function processChannel(channel: Channel, supabase: AdminClient = createAdminClient()): Promise<SyncReport> {
  const a = ADAPTERS[channel];
  const report: SyncReport = { channel, sent: 0, batches: 0, confirmed: 0, failed: 0, errors: [] };
  const { enabled, ready, cfg } = await a.load(supabase);
  if (!enabled) return { ...report, skipped: "disabled" };
  if (!ready) return { ...report, skipped: "no_credentials" };
  const sb = supabase as any;
  const zeroOkVariants: string[] = [];

  // ── 1) Gönder ──
  for (let round = 0; round < (a.maxRounds ?? 5); round++) {
    const { data: inflight } = await sb.from("marketplace_stock_sync").select("batch_request_id")
      .eq("channel", channel).eq("status", "sent").not("batch_request_id", "is", null).limit(5000);
    if (new Set(((inflight as any[]) || []).map((r) => r.batch_request_id)).size >= a.maxInFlight) break;

    const { data: rows, error } = await sb.rpc("claim_marketplace_stock", { p_channel: channel, p_limit: a.maxBatch });
    if (error) { report.errors.push(error.message); break; }
    const list = (rows as any[]) || [];
    if (!list.length) break;

    // Aynı anahtar iki varyantta olursa tek kalem (sonuncusu); sıra = kalem no
    const qtyByKey = new Map<string, number>();
    for (const r of list) qtyByKey.set(r.barcode, Number(r.sending_qty ?? r.desired_qty ?? 0));
    const keys = [...qtyByKey.keys()];
    const posByKey = new Map(keys.map((k, i) => [k, i + 1]));
    const items = keys.map((key) => ({ key, qty: qtyByKey.get(key)! }));
    const ids = list.map((r) => r.id);

    try {
      const sent = await a.send(cfg, items);
      const batchId = typeof sent === "string" ? sent : sent.batchId;
      await sb.rpc("mark_marketplace_stock_sent", { p_ids: ids, p_batch: batchId, p_pos: list.map((r) => posByKey.get(r.barcode)) });
      report.sent += items.length;
      report.batches += 1;
      if (typeof sent !== "string") await settleImmediate(sb, channel, batchId, sent.results, report, zeroOkVariants);
    } catch (e: any) {
      const msg = e?.message || String(e);
      await sb.rpc("mark_marketplace_stock_retry", { p_ids: ids, p_error: msg });
      report.errors.push(msg);
      // 8 denemede kalıcı hataya düşenleri geçmişe yaz
      const { data: dead } = await sb.from("marketplace_stock_sync")
        .select("variant_id, product_id, barcode, desired_qty, error").in("id", ids).eq("status", "failed");
      await writeLog(sb, channel, (dead as any[]) || [], false, (r) => `Gönderilemedi (8 deneme): ${r.error || msg}`, null);
      if (a.isFatal(e)) break;
    }
  }

  // ── 2) Sonuçları doğrula ──
  const { data: sentRows } = await sb
    .from("marketplace_stock_sync")
    .select("id, variant_id, product_id, barcode, last_sent_qty, batch_pos, batch_request_id, sent_at")
    .eq("channel", channel)
    .eq("status", "sent")
    .lt("sent_at", new Date(Date.now() - 5000).toISOString())
    .order("sent_at", { ascending: true })
    .limit(5000);
  const byBatch = new Map<string, SentRow[]>();
  for (const r of (sentRows as any[]) || []) {
    if (!r.batch_request_id) continue;
    if (!byBatch.has(r.batch_request_id)) byBatch.set(r.batch_request_id, []);
    byBatch.get(r.batch_request_id)!.push(r);
  }

  for (const [batchId, rows] of [...byBatch.entries()].slice(0, 20)) {
    const oldest = Math.min(...rows.map((r) => new Date(r.sent_at).getTime()));
    let res: { done: boolean; failures: Map<string, string> };
    try {
      res = await a.result(cfg, batchId, rows);
    } catch (e: any) {
      // Sonuç kanalda 4 saatten eskiyse doğrulanamaz; gönderim kabul edilmişti → başarılı say
      if (Date.now() - oldest > 4 * 3600_000) {
        const note = "Sonuç doğrulanamadı (gönderim kabul edilmişti)";
        await sb.from("marketplace_stock_sync")
          .update({ status: "ok", confirmed_at: new Date().toISOString(), error: note })
          .in("id", rows.map((r) => r.id)).eq("status", "sent").eq("batch_request_id", batchId);
        await writeLog(sb, channel, rows, true, () => note, batchId);
      } else {
        report.errors.push(e?.message || String(e));
      }
      continue;
    }
    if (!res.done) continue;

    const okRows = rows.filter((r) => !res.failures.has(r.id));
    const badRows = rows.filter((r) => res.failures.has(r.id));
    for (const r of badRows) {
      await sb.from("marketplace_stock_sync")
        .update({ status: "failed", error: res.failures.get(r.id), updated_at: new Date().toISOString() })
        .eq("id", r.id).eq("status", "sent").eq("batch_request_id", batchId);
    }
    if (okRows.length) {
      await sb.from("marketplace_stock_sync")
        .update({ status: "ok", confirmed_at: new Date().toISOString(), error: null })
        .in("id", okRows.map((r) => r.id)).eq("status", "sent").eq("batch_request_id", batchId);
      for (const r of okRows) if (Number(r.last_sent_qty) === 0) zeroOkVariants.push(r.variant_id);
    }
    await writeLog(sb, channel, okRows, true, () => null, batchId);
    await writeLog(sb, channel, badRows, false, (r) => res.failures.get(r.id) || null, batchId);
    report.confirmed += okRows.length;
    report.failed += badRows.length;
  }

  // ── 3) Stok 0 kanala işlendiyse o kanalın manuel görevini otomatik kapat ──
  if (zeroOkVariants.length) {
    const { data: ch } = await sb.from("marketplace_channels").select("id").ilike("name", a.label).maybeSingle();
    if (ch?.id) {
      await sb.from("stock_sync_tasks")
        .update({ status: "done", method: "api", done_at: new Date().toISOString(), note: `${a.label} API ile otomatik` })
        .eq("channel_id", ch.id).eq("status", "pending").in("variant_id", zeroOkVariants);
    }
  }

  return report;
}

/** Tüm kanallar (cron + anlık tetik). */
export async function processMarketplaceStock(supabase: AdminClient = createAdminClient()): Promise<SyncReport[]> {
  const out: SyncReport[] = [];
  for (const c of CHANNELS) {
    try {
      out.push(await processChannel(c, supabase));
    } catch (e: any) {
      out.push({ channel: c, sent: 0, batches: 0, confirmed: 0, failed: 0, errors: [e?.message || String(e)] });
    }
  }
  return out;
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
        const reports = await processMarketplaceStock();
        for (const r of reports) {
          sentBatches += r.batches;
          if (r.errors.length) console.error(`[marketplace-sync:${r.channel}]`, r.errors.join(" | "));
        }
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
