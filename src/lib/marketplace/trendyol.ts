/* eslint-disable @typescript-eslint/no-explicit-any */
// Trendyol Satıcı (Partner) API istemcisi — yalnız sunucuda kullanılır.
// Kimlik: HTTP Basic (API Key : API Secret) + zorunlu "User-Agent: <SatıcıID> - SelfIntegration".
// Stok/fiyat: POST /integration/inventory/sellers/{id}/products/price-and-inventory
//   (istek başına en çok 1000 barkod; stok en çok 20.000; aynı gövde 15 dk içinde tekrar gönderilemez)
// Sonuç: GET /integration/product/sellers/{id}/products/batch-requests/{batchRequestId} (4 saat saklanır)
// Belge: https://developers.trendyol.com/docs/stok-ve-fiyat-g%C3%BCncelleme-updatepriceandinventory

import type { createAdminClient } from "@/lib/supabase-admin";
type AdminClient = ReturnType<typeof createAdminClient>;

export type TrendyolConfig = {
  enabled: boolean;
  sellerId: string;
  apiKey: string;
  apiSecret: string;
  stage: boolean;
};

export class TrendyolError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function getTrendyolConfig(supabase: AdminClient): Promise<TrendyolConfig> {
  const { data } = await (supabase as any)
    .from("settings")
    .select("trendyol_enabled, trendyol_seller_id, trendyol_api_key, trendyol_api_secret, trendyol_stage")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  return {
    enabled: !!data?.trendyol_enabled,
    sellerId: String(data?.trendyol_seller_id || "").trim(),
    apiKey: String(data?.trendyol_api_key || "").trim(),
    apiSecret: String(data?.trendyol_api_secret || "").trim(),
    stage: !!data?.trendyol_stage,
  };
}

export const hasCredentials = (c: TrendyolConfig) => !!(c.sellerId && c.apiKey && c.apiSecret);

function base(c: TrendyolConfig) {
  return c.stage ? "https://stageapigw.trendyol.com" : "https://apigw.trendyol.com";
}

function headers(c: TrendyolConfig) {
  return {
    Authorization: "Basic " + Buffer.from(`${c.apiKey}:${c.apiSecret}`).toString("base64"),
    "User-Agent": `${c.sellerId} - SelfIntegration`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function call(c: TrendyolConfig, method: "GET" | "POST", path: string, body?: unknown) {
  let res: Response;
  try {
    res = await fetch(base(c) + path, {
      method,
      headers: headers(c),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
  } catch (e: any) {
    throw new TrendyolError(0, `Trendyol'a bağlanılamadı: ${e?.message || e}`);
  }
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* düz metin */ }
  if (!res.ok) {
    const msg =
      json?.errors?.map((e: any) => e?.message || e?.key).filter(Boolean).join("; ") ||
      json?.message || json?.error || text?.slice(0, 300) || res.statusText;
    const hint = res.status === 401 || res.status === 403
      ? " (Satıcı ID / API Key / API Secret'ı kontrol et)"
      : res.status === 429 ? " (istek sınırı — biraz sonra tekrar denenecek)" : "";
    throw new TrendyolError(res.status, `Trendyol ${res.status}: ${msg}${hint}`);
  }
  return json;
}

/** Bağlantı testi: ürün listesinin ilk sayfası. Trendyol'daki toplam ürün sayısını döner. */
export async function testConnection(c: TrendyolConfig): Promise<{ totalProducts: number | null; services: { name: string; ok: boolean; detail: string }[] }> {
  const j = await call(c, "GET", `/integration/product/sellers/${encodeURIComponent(c.sellerId)}/products?page=0&size=1`);
  const totalProducts = typeof j?.totalElements === "number" ? j.totalElements : null;
  // Servis bazında tanı: aynı anahtar ürün servisinde çalışıp sipariş servisinde reddedilebiliyor
  // (hesap/anahtar yetkisi). Sonuç Trendyol desteğine iletilebilecek netlikte gösterilir.
  const services: { name: string; ok: boolean; detail: string }[] = [
    { name: "Ürün / stok servisi", ok: true, detail: `${totalProducts ?? "?"} ürün` },
  ];
  const now = Date.now();
  try {
    const o = await call(c, "GET", `/integration/order/sellers/${encodeURIComponent(c.sellerId)}/v2/orders?startDate=${now - 86400_000}&endDate=${now}&page=0&size=1`);
    services.push({ name: "Sipariş servisi (Order V2)", ok: true, detail: `son 24 saatte ${o?.totalElements ?? 0} paket` });
  } catch (e: any) {
    services.push({ name: "Sipariş servisi (Order V2)", ok: false, detail: e?.message || String(e) });
  }
  return { totalProducts, services };
}

/** Stok gönder (yalnız stok; fiyat gönderilmez). batchRequestId döner. */
export async function updateStocks(c: TrendyolConfig, items: { barcode: string; quantity: number }[]): Promise<string> {
  const j = await call(c, "POST", `/integration/inventory/sellers/${encodeURIComponent(c.sellerId)}/products/price-and-inventory`, { items });
  const id = j?.batchRequestId;
  if (!id) throw new TrendyolError(0, "Trendyol batchRequestId döndürmedi");
  return String(id);
}

/** Fiyat gönder (satış + liste/PSF; Trendyol liste fiyatı ≥ satış fiyatı ister). batchRequestId döner. */
export async function updatePrices(c: TrendyolConfig, items: { barcode: string; salePrice: number; listPrice: number }[]): Promise<string> {
  const j = await call(c, "POST", `/integration/inventory/sellers/${encodeURIComponent(c.sellerId)}/products/price-and-inventory`, { items });
  const id = j?.batchRequestId;
  if (!id) throw new TrendyolError(0, "Trendyol batchRequestId döndürmedi");
  return String(id);
}

export type BatchItemResult = { barcode: string; ok: boolean; reason: string | null };

/** Toplu isteğin sonucu. done=false ise Trendyol hâlâ işliyor. */
export async function getBatchResult(c: TrendyolConfig, batchId: string): Promise<{ done: boolean; items: BatchItemResult[] }> {
  const j = await call(c, "GET", `/integration/product/sellers/${encodeURIComponent(c.sellerId)}/products/batch-requests/${encodeURIComponent(batchId)}`);
  const status = String(j?.status || "").toUpperCase();
  const items: BatchItemResult[] = ((j?.items as any[]) || []).map((it) => {
    const barcode = String(it?.requestItem?.barcode ?? it?.requestItem?.product?.barcode ?? it?.barcode ?? "");
    const st = String(it?.status || "").toUpperCase();
    const reasons = ((it?.failureReasons as any[]) || []).map((r) => (typeof r === "string" ? r : r?.message || JSON.stringify(r)));
    return { barcode, ok: st === "SUCCESS", reason: reasons.length ? reasons.join("; ") : (st && st !== "SUCCESS" ? st : null) };
  });
  return { done: status === "COMPLETED" || (items.length > 0 && status !== "IN_PROGRESS"), items };
}

/** İLANDAKİ ürünlerin barkodları (arşivlenmemiş, kara listede olmayan) — ilan eşitleme. */
export async function listTrendyolBarcodes(c: TrendyolConfig): Promise<string[]> {
  const out: string[] = [];
  for (let page = 0; page < 1000; page++) {
    const j = await call(c, "GET", `/integration/product/sellers/${encodeURIComponent(c.sellerId)}/products?page=${page}&size=200&archived=false`);
    const items: any[] = Array.isArray(j?.content) ? j.content : [];
    for (const p of items) {
      if (p?.barcode && !p.archived && !p.blacklisted) out.push(String(p.barcode));
    }
    const totalPages = Number(j?.totalPages ?? 0);
    if (!items.length || page + 1 >= totalPages) break;
  }
  return out;
}
