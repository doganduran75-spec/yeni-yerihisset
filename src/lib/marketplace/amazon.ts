/* eslint-disable @typescript-eslint/no-explicit-any */
// Amazon Selling Partner API (SP-API) istemcisi — Amazon.com.tr (Avrupa bölgesi) — yalnız sunucuda.
// Kimlik: Login with Amazon (LWA) — Client ID + Client Secret + Refresh Token → 1 saatlik erişim
// anahtarı (x-amz-access-token). Satıcı paneli → Uygulamalar ve Hizmetler → Uygulama Geliştirme
// (özel / "private" geliştirici, kendi hesabına yetki). Belge: developer-docs.amazon.com/sp-api
//   Stok:  PATCH /listings/2021-08-01/items/{sellerId}/{sku}  (SKU başına tek istek, saniyede 5)
//          productType "PRODUCT" + /attributes/fulfillment_availability (DEFAULT = satıcı gönderimi)
//          Yanıt EŞZAMANLI: ACCEPTED (kabul) / INVALID (+sorunlar).
//   İlan:  GET /listings/2021-08-01/items/{sellerId}  (searchListingsItems; sayfa 20, sorgu başına
//          en çok 1000 → fazlası oluşturulma tarihine göre aralıklara bölünür)
//   Test:  GET /sellers/v1/marketplaceParticipations
// Türkiye pazaryeri: A33AVAJ2PDY3EV (sellingpartnerapi-eu). Avrupa pazaryerleri aynı uç, farklı kimlik.

import type { createAdminClient } from "@/lib/supabase-admin";
type AdminClient = ReturnType<typeof createAdminClient>;

const BASE = "https://sellingpartnerapi-eu.amazon.com";
const LWA_URL = "https://api.amazon.com/auth/o2/token";
export const AMAZON_TR = "A33AVAJ2PDY3EV";

export type AmazonConfig = {
  enabled: boolean;
  sellerId: string;        // Satıcı token'ı (Merchant Token)
  clientId: string;        // LWA
  clientSecret: string;
  refreshToken: string;
  marketplaceId: string;
  matchField: "sku" | "barcode";
};

export class AmazonError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function getAmazonConfig(supabase: AdminClient): Promise<AmazonConfig> {
  const { data } = await (supabase as any)
    .from("settings")
    .select("amazon_enabled, amazon_seller_id, amazon_lwa_client_id, amazon_lwa_client_secret, amazon_refresh_token, amazon_marketplace_id, amazon_match_field")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  return {
    enabled: !!data?.amazon_enabled,
    sellerId: String(data?.amazon_seller_id || "").trim(),
    clientId: String(data?.amazon_lwa_client_id || "").trim(),
    clientSecret: String(data?.amazon_lwa_client_secret || "").trim(),
    refreshToken: String(data?.amazon_refresh_token || "").trim(),
    marketplaceId: String(data?.amazon_marketplace_id || AMAZON_TR).trim() || AMAZON_TR,
    matchField: data?.amazon_match_field === "barcode" ? "barcode" : "sku",
  };
}

export const amzHasCredentials = (c: AmazonConfig) => !!(c.sellerId && c.clientId && c.clientSecret && c.refreshToken);

// ── LWA erişim anahtarı (süreç içinde önbellek; 1 saat geçerli, 5 dk önce yenilenir) ──
let tokenCache: { key: string; token: string; exp: number } | null = null;
async function accessToken(c: AmazonConfig): Promise<string> {
  const key = `${c.clientId}|${c.refreshToken.slice(-12)}`;
  if (tokenCache && tokenCache.key === key && tokenCache.exp > Date.now() + 5 * 60_000) return tokenCache.token;
  let res: Response;
  try {
    res = await fetch(LWA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: c.refreshToken, client_id: c.clientId, client_secret: c.clientSecret }).toString(),
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
  } catch (e: any) {
    throw new AmazonError(0, `Amazon'a (LWA) bağlanılamadı: ${e?.message || e}`);
  }
  const j: any = await res.json().catch(() => null);
  if (!res.ok || !j?.access_token) {
    throw new AmazonError(401, `Amazon giriş anahtarı alınamadı: ${j?.error_description || j?.error || res.status} (Client ID / Client Secret / Refresh Token'ı kontrol et)`);
  }
  tokenCache = { key, token: j.access_token, exp: Date.now() + Number(j.expires_in || 3600) * 1000 };
  return j.access_token;
}

async function call(c: AmazonConfig, method: "GET" | "PATCH", path: string, query?: Record<string, string>, body?: unknown) {
  const token = await accessToken(c);
  const qs = query ? "?" + new URLSearchParams(query).toString() : "";
  let res: Response;
  try {
    res = await fetch(BASE + path + qs, {
      method,
      headers: {
        "x-amz-access-token": token,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "YeriHisset/1.0 (Language=TypeScript)",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
      cache: "no-store",
    });
  } catch (e: any) {
    throw new AmazonError(0, `Amazon'a bağlanılamadı: ${e?.message || e}`);
  }
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* düz metin */ }
  if (!res.ok) {
    const msg = (Array.isArray(json?.errors) ? json.errors.map((e: any) => [e?.code, e?.message].filter(Boolean).join(": ")).join("; ") : null)
      || text?.slice(0, 300) || res.statusText;
    const hint = res.status === 401 || res.status === 403
      ? " (uygulamanın rolü / yetkisi eksik olabilir: Ürün Listeleme + Envanter ve Sipariş Takibi)"
      : res.status === 429 ? " (istek sınırı — biraz sonra tekrar denenecek)" : "";
    if (res.status === 401 || res.status === 403) tokenCache = null;
    throw new AmazonError(res.status, `Amazon ${res.status}: ${msg}${hint}`);
  }
  return json;
}

export { call as amazonCall };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Bağlantı testi: hesabın açık olduğu pazaryerleri + seçili pazaryerindeki ilan sayısı */
export async function amzTestConnection(c: AmazonConfig): Promise<{ totalProducts: number | null; marketplaces: string[]; participating: boolean }> {
  const j = await call(c, "GET", "/sellers/v1/marketplaceParticipations");
  const list = (j?.payload ?? []) as any[];
  const marketplaces = list.map((p) => `${p?.marketplace?.name ?? p?.marketplace?.id}${p?.participation?.isParticipating === false ? " (pasif)" : ""}`);
  const participating = list.some((p) => p?.marketplace?.id === c.marketplaceId && p?.participation?.isParticipating !== false);
  let totalProducts: number | null = null;
  if (participating) {
    const s = await call(c, "GET", `/listings/2021-08-01/items/${encodeURIComponent(c.sellerId)}`, {
      marketplaceIds: c.marketplaceId, pageSize: "1",
    });
    totalProducts = typeof s?.numberOfResults === "number" ? s.numberOfResults : null;
  }
  return { totalProducts, marketplaces, participating };
}

export type AmazonStockResult = { ok: boolean; reason?: string; retry?: boolean };

/** Tek SKU'nun satıcı-gönderimli (FBM) stoğunu yaz. */
async function patchStock(c: AmazonConfig, sku: string, qty: number): Promise<AmazonStockResult> {
  const j = await call(c, "PATCH", `/listings/2021-08-01/items/${encodeURIComponent(c.sellerId)}/${encodeURIComponent(sku)}`, {
    marketplaceIds: c.marketplaceId, issueLocale: "tr_TR",
  }, {
    productType: "PRODUCT",
    patches: [{
      op: "replace",
      path: "/attributes/fulfillment_availability",
      value: [{ fulfillment_channel_code: "DEFAULT", quantity: Math.max(0, Math.floor(qty)) }],
    }],
  });
  if (j?.status === "ACCEPTED") return { ok: true };
  const issues = ((j?.issues ?? []) as any[]).filter((i) => i?.severity === "ERROR");
  const reason = issues.map((i) => [i?.code, i?.message].filter(Boolean).join(": ")).join("; ") || `Amazon kabul etmedi (${j?.status ?? "?"})`;
  return { ok: false, reason };
}

/** Stok gönder — SKU başına istek, saniyede ~4 (sınır 5). Sonuç anahtar başına HEMEN döner.
 *  Yetki hatası tüm paketi durdurur (fırlatır); istek sınırı → kalanlar "biraz sonra tekrar". */
export async function amzUpdateStocks(c: AmazonConfig, items: { key: string; qty: number }[]): Promise<Map<string, AmazonStockResult>> {
  const out = new Map<string, AmazonStockResult>();
  let throttled = false;
  for (const it of items) {
    if (throttled) { out.set(it.key, { ok: false, retry: true, reason: "Amazon istek sınırı — biraz sonra tekrar" }); continue; }
    const t0 = Date.now();
    try {
      out.set(it.key, await patchStock(c, it.key, it.qty));
    } catch (e: any) {
      if (e instanceof AmazonError && (e.status === 401 || e.status === 403) && out.size === 0) throw e;
      if (e instanceof AmazonError && e.status === 429) throttled = true;
      const notFound = e instanceof AmazonError && e.status === 404;
      out.set(it.key, { ok: false, retry: !notFound, reason: notFound ? "Bu SKU Amazon'da yok" : e?.message || String(e) });
    }
    const wait = 250 - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
  }
  return out;
}

/** İLANDAKİ SKU'lar (seçili pazaryeri) — ilan eşitleme. Sorgu başına 1000 sınırı aralıklara bölünerek aşılır. */
export async function amzListSkus(c: AmazonConfig): Promise<string[]> {
  const out = new Set<string>();
  const path = `/listings/2021-08-01/items/${encodeURIComponent(c.sellerId)}`;
  const base = { marketplaceIds: c.marketplaceId, includedData: "summaries", pageSize: "20", sortBy: "sku", sortOrder: "ASC" };

  async function range(after: number, before: number, depth: number) {
    let pageToken = "";
    for (let page = 0; page < 60; page++) {
      const q: Record<string, string> = { ...base, createdAfter: new Date(after).toISOString(), createdBefore: new Date(before).toISOString() };
      if (pageToken) q.pageToken = pageToken;
      const j = await call(c, "GET", path, q);
      // İlk sayfada toplam 1000'i aşıyorsa aralığı ikiye böl
      if (page === 0 && Number(j?.numberOfResults ?? 0) > 1000 && depth < 20 && before - after > 3600_000) {
        const mid = after + Math.floor((before - after) / 2);
        await range(after, mid, depth + 1);
        await range(mid, before, depth + 1);
        return;
      }
      for (const it of (j?.items ?? []) as any[]) if (it?.sku) out.add(String(it.sku));
      pageToken = j?.pagination?.nextToken ?? "";
      if (!pageToken) return;
      await sleep(250);
    }
  }
  await range(Date.UTC(2005, 0, 1), Date.now() - 60_000, 0);
  return [...out];
}
