/* eslint-disable @typescript-eslint/no-explicit-any */
// Pazaryeri FİYAT kuyruğu işleyicisi (Trendyol: satış + PSF, Hepsiburada: satış).
// Kuyruğa yalnız Fiyatlar sayfasından "Kaydet ve pazaryerlerine gönder" / "filtrelenmişi gönder"
// ile girer (enqueue_marketplace_prices). Stok işleyicisiyle aynı desen: kilitle → gönder →
// sonucu doğrula → Senkron Geçmişi'ne (kind=price) yaz. Kanal kapalıysa satırlar bekler.

import { createAdminClient } from "@/lib/supabase-admin";
import { getTrendyolConfig, hasCredentials, updatePrices, getBatchResult, TrendyolError } from "@/lib/marketplace/trendyol";
import { getHepsiburadaConfig, hbHasCredentials, hbUpdatePrices, hbGetUploadResult, HepsiburadaError } from "@/lib/marketplace/hepsiburada";
// Fiyat gönderimi yalnız Trendyol + Hepsiburada (Amazon fiyatı: sonraki aşama)
type Channel = "trendyol" | "hepsiburada";

type AdminClient = ReturnType<typeof createAdminClient>;
export type PriceReport = { channel: Channel; skipped?: "disabled" | "no_credentials"; sent: number; confirmed: number; failed: number; errors: string[] };

type Claimed = { id: string; variant_id: string; product_id: string | null; listing_key: string; sending_sale: number; sending_list: number | null };
type SentRow = { id: string; variant_id: string; product_id: string | null; listing_key: string; sale_price: number; batch_pos: number | null; sent_at: string };

const ADAPTERS = {
  trendyol: {
    maxBatch: 1000,
    maxInFlight: 20,
    async load(sb: AdminClient) { const c = await getTrendyolConfig(sb); return { enabled: c.enabled, ready: hasCredentials(c), cfg: c as any }; },
    async send(cfg: any, rows: Claimed[]) {
      const items = rows.map((r) => {
        const sale = Number(r.sending_sale);
        const list = Math.max(Number(r.sending_list ?? sale), sale); // Trendyol: PSF ≥ satış
        return { barcode: r.listing_key, salePrice: sale, listPrice: list };
      });
      return updatePrices(cfg, items);
    },
    async result(cfg: any, batchId: string, rows: SentRow[]) {
      const r = await getBatchResult(cfg, batchId);
      const failures = new Map<string, string>();
      if (!r.done) return { done: false, failures };
      const byKey = new Map(r.items.map((i) => [i.barcode, i]));
      for (const row of rows) { const it = byKey.get(row.listing_key); if (it && !it.ok) failures.set(row.id, it.reason || "Trendyol reddetti"); }
      return { done: true, failures };
    },
    isFatal: (e: unknown) => e instanceof TrendyolError && [0, 401, 403, 429].includes(e.status),
  },
  hepsiburada: {
    maxBatch: 4000,
    maxInFlight: 1, // HB: aynı anda en çok 5 bekleyen yükleme (stokla paylaşılır)
    async load(sb: AdminClient) { const c = await getHepsiburadaConfig(sb); return { enabled: c.enabled, ready: hbHasCredentials(c), cfg: c as any }; },
    async send(cfg: any, rows: Claimed[]) {
      return hbUpdatePrices(cfg, rows.map((r) => ({ key: r.listing_key, price: Number(r.sending_sale) })));
    },
    async result(cfg: any, batchId: string, rows: SentRow[]) {
      const r = await hbGetUploadResult(cfg, batchId, "price");
      const failures = new Map<string, string>();
      if (!r.done) return { done: false, failures };
      if (r.failedAll) { for (const row of rows) failures.set(row.id, r.failedAll); return { done: true, failures }; }
      for (const e of r.errors) for (const row of rows) {
        if ((e.pos != null && row.batch_pos === e.pos) || (e.key && row.listing_key === e.key)) failures.set(row.id, e.reason);
      }
      return { done: true, failures };
    },
    isFatal: (e: unknown) => e instanceof HepsiburadaError && [0, 401, 403, 429].includes(e.status),
  },
} as const;

async function log(sb: any, channel: Channel, rows: any[], ok: boolean, reason: (r: any) => string | null, batchId: string | null) {
  if (!rows.length) return;
  await sb.from("marketplace_stock_log").insert(rows.map((r) => ({
    channel, kind: "price", variant_id: r.variant_id, product_id: r.product_id ?? null, listing_key: r.listing_key,
    qty: 0, price: Number(r.sale_price ?? r.sending_sale ?? 0), ok, message: reason(r), batch_request_id: batchId,
  })));
}

export async function processPriceChannel(channel: Channel, supabase: AdminClient = createAdminClient()): Promise<PriceReport> {
  const a = ADAPTERS[channel];
  const rep: PriceReport = { channel, sent: 0, confirmed: 0, failed: 0, errors: [] };
  const { enabled, ready, cfg } = await a.load(supabase);
  if (!enabled) return { ...rep, skipped: "disabled" };
  if (!ready) return { ...rep, skipped: "no_credentials" };
  const sb = supabase as any;

  // 1) Gönder
  for (let round = 0; round < 3; round++) {
    const { data: inflight } = await sb.from("marketplace_price_sync").select("batch_request_id").eq("channel", channel).eq("status", "sent");
    if (new Set(((inflight as any[]) || []).map((r) => r.batch_request_id)).size >= a.maxInFlight) break;
    const { data: rows, error } = await sb.rpc("claim_marketplace_price", { p_channel: channel, p_limit: a.maxBatch });
    if (error) { rep.errors.push(error.message); break; }
    const list = (rows as Claimed[]) || [];
    if (!list.length) break;
    const ids = list.map((r) => r.id);
    try {
      const batchId = await a.send(cfg, list);
      await sb.rpc("mark_marketplace_price_sent", { p_ids: ids, p_batch: batchId, p_pos: list.map((_, i) => i + 1) });
      rep.sent += list.length;
    } catch (e: any) {
      const msg = e?.message || String(e);
      await sb.rpc("mark_marketplace_price_retry", { p_ids: ids, p_error: msg });
      rep.errors.push(msg);
      if (a.isFatal(e)) break;
    }
  }

  // 2) Doğrula
  const { data: sentRows } = await sb.from("marketplace_price_sync")
    .select("id, variant_id, product_id, listing_key, sale_price, batch_pos, batch_request_id, sent_at")
    .eq("channel", channel).eq("status", "sent").lt("sent_at", new Date(Date.now() - 5000).toISOString()).limit(5000);
  const byBatch = new Map<string, SentRow[]>();
  for (const r of (sentRows as any[]) || []) {
    if (!r.batch_request_id) continue;
    if (!byBatch.has(r.batch_request_id)) byBatch.set(r.batch_request_id, []);
    byBatch.get(r.batch_request_id)!.push(r);
  }
  for (const [batchId, rows] of [...byBatch.entries()].slice(0, 20)) {
    let res: { done: boolean; failures: Map<string, string> };
    try { res = await a.result(cfg, batchId, rows); }
    catch (e: any) {
      const oldest = Math.min(...rows.map((r) => new Date(r.sent_at).getTime()));
      if (Date.now() - oldest > 4 * 3600_000) {
        await sb.from("marketplace_price_sync").update({ status: "ok", confirmed_at: new Date().toISOString(), error: "Sonuç doğrulanamadı" })
          .in("id", rows.map((r) => r.id)).eq("status", "sent");
        await log(sb, channel, rows, true, () => "Sonuç doğrulanamadı (gönderim kabul edilmişti)", batchId);
      } else rep.errors.push(e?.message || String(e));
      continue;
    }
    if (!res.done) continue;
    const okRows = rows.filter((r) => !res.failures.has(r.id));
    const badRows = rows.filter((r) => res.failures.has(r.id));
    for (const r of badRows) {
      await sb.from("marketplace_price_sync").update({ status: "failed", error: res.failures.get(r.id), updated_at: new Date().toISOString() })
        .eq("id", r.id).eq("status", "sent").eq("batch_request_id", batchId);
    }
    if (okRows.length) {
      await sb.from("marketplace_price_sync").update({ status: "ok", confirmed_at: new Date().toISOString(), error: null })
        .in("id", okRows.map((r) => r.id)).eq("status", "sent").eq("batch_request_id", batchId);
    }
    await log(sb, channel, okRows, true, () => null, batchId);
    await log(sb, channel, badRows, false, (r) => res.failures.get(r.id) || null, batchId);
    rep.confirmed += okRows.length;
    rep.failed += badRows.length;
  }
  return rep;
}

export async function processMarketplacePrices(supabase: AdminClient = createAdminClient()): Promise<PriceReport[]> {
  const out: PriceReport[] = [];
  for (const c of ["trendyol", "hepsiburada"] as Channel[]) {
    try { out.push(await processPriceChannel(c, supabase)); }
    catch (e: any) { out.push({ channel: c, sent: 0, confirmed: 0, failed: 0, errors: [e?.message || String(e)] }); }
  }
  return out;
}

/** Fiyatlar sayfasından: verilen varyantların kanal fiyatlarını kuyruğa al + hemen gönder. */
export async function pushPrices(variantIds: string[], supabase: AdminClient = createAdminClient()) {
  const sb = supabase as any;
  const queued: Record<string, number> = {};
  for (const c of ["trendyol", "hepsiburada"] as Channel[]) {
    const { data, error } = await sb.rpc("enqueue_marketplace_prices", { p_channel: c, p_variant_ids: variantIds });
    if (error) throw new Error(error.message);
    queued[c] = Number(data ?? 0);
  }
  const reports = await processMarketplacePrices(supabase);
  // Sonuçları birkaç saniye sonra doğrula (cron'u beklemeden)
  setTimeout(() => { processMarketplacePrices().catch(() => {}); }, 8000);
  return { queued, reports };
}
