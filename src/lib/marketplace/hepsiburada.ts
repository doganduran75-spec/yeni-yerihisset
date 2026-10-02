/* eslint-disable @typescript-eslint/no-explicit-any */
// Hepsiburada Listeleme (Listing External) API istemcisi — yalnız sunucuda.
// Kimlik (2024 sonrası): HTTP Basic (MerchantID : Servis Anahtarı) + zorunlu
// "User-Agent: <entegratör kullanıcı adı>".
// Stok: POST /listings/merchantid/{merchantId}/stock-uploads   gövde: [{ merchantSku, availableStock }]
//   (istek başına en çok 4000 SKU; aynı anda en çok 5 bekleyen yükleme)
// Sonuç: GET /listings/merchantid/{merchantId}/stock-uploads/id/{id} → { status, total, errors }
// Test ortamı: alan adında "-sit" (listing-external-sit.hepsiburada.com).
// Belge: developers.hepsiburada.com → Listeleme Ve Satışa Açma → Listing Stok Güncelleme

import type { createAdminClient } from "@/lib/supabase-admin";
type AdminClient = ReturnType<typeof createAdminClient>;

export type HepsiburadaConfig = {
  enabled: boolean;
  merchantId: string;
  serviceKey: string;
  username: string;    // User-Agent
  matchField: "barcode" | "sku";
  stage: boolean;
};

export class HepsiburadaError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function getHepsiburadaConfig(supabase: AdminClient): Promise<HepsiburadaConfig> {
  const { data } = await (supabase as any)
    .from("settings")
    .select("hepsiburada_enabled, hepsiburada_merchant_id, hepsiburada_service_key, hepsiburada_username, hepsiburada_match_field, hepsiburada_stage")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  return {
    enabled: !!data?.hepsiburada_enabled,
    merchantId: String(data?.hepsiburada_merchant_id || "").trim(),
    serviceKey: String(data?.hepsiburada_service_key || "").trim(),
    username: String(data?.hepsiburada_username || "").trim(),
    matchField: data?.hepsiburada_match_field === "sku" ? "sku" : "barcode",
    stage: !!data?.hepsiburada_stage,
  };
}

export const hbHasCredentials = (c: HepsiburadaConfig) => !!(c.merchantId && c.serviceKey && c.username);

function base(c: HepsiburadaConfig) {
  return c.stage ? "https://listing-external-sit.hepsiburada.com" : "https://listing-external.hepsiburada.com";
}

async function call(c: HepsiburadaConfig, method: "GET" | "POST", path: string, body?: unknown) {
  let res: Response;
  try {
    res = await fetch(base(c) + path, {
      method,
      headers: {
        Authorization: "Basic " + Buffer.from(`${c.merchantId}:${c.serviceKey}`).toString("base64"),
        "User-Agent": c.username,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
  } catch (e: any) {
    throw new HepsiburadaError(0, `Hepsiburada'ya bağlanılamadı: ${e?.message || e}`);
  }
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* düz metin */ }
  if (!res.ok) {
    const msg =
      (Array.isArray(json?.errors) ? json.errors.map((e: any) => e?.message || e?.errorMessage || e).join("; ") : null) ||
      json?.message || json?.title || json?.error || text?.slice(0, 300) || res.statusText;
    const hint = res.status === 401 || res.status === 403
      ? " (Merchant ID / Servis Anahtarı / kullanıcı adını kontrol et)"
      : res.status === 429 ? " (istek sınırı — biraz sonra tekrar denenecek)" : "";
    throw new HepsiburadaError(res.status, `Hepsiburada ${res.status}: ${msg}${hint}`);
  }
  return json;
}

// ── Test (SIT) ortamı: Hepsiburada'nın canlıya geçiş için istediği adımlar ──
// HER ZAMAN "-sit" adreslerine gider (canlı sisteme dokunamaz). Hata da olsa
// ham yanıtı döner — Test Merkezi ekranında gösterilir, Hepsiburada'ya iletilir.
const SIT_HOSTS = {
  listing: "https://listing-external-sit.hepsiburada.com",
  mpop: "https://mpop-sit.hepsiburada.com",
  oms: "https://oms-external-sit.hepsiburada.com",
  omsStub: "https://oms-stub-external-sit.hepsiburada.com",
} as const;
export type SitService = keyof typeof SIT_HOSTS;

export async function hbSitRequest(
  c: HepsiburadaConfig, service: SitService, method: "GET" | "POST", path: string, body?: unknown,
): Promise<{ status: number; ok: boolean; url: string; json: any; text: string }> {
  const url = SIT_HOSTS[service] + path;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: "Basic " + Buffer.from(`${c.merchantId}:${c.serviceKey}`).toString("base64"),
        "User-Agent": c.username,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
      cache: "no-store",
    });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* düz metin */ }
    return { status: res.status, ok: res.ok, url, json, text: text.slice(0, 20000) };
  } catch (e: any) {
    return { status: 0, ok: false, url, json: null, text: `Bağlanılamadı: ${e?.message || e}` };
  }
}

/** Bağlantı testi: ilk listing sayfası (toplam listing sayısı). */
export async function hbTestConnection(c: HepsiburadaConfig): Promise<{ totalProducts: number | null }> {
  const j = await call(c, "GET", `/listings/merchantid/${encodeURIComponent(c.merchantId)}?offset=0&limit=1`);
  const total = j?.totalCount ?? j?.total ?? j?.totalElements;
  return { totalProducts: typeof total === "number" ? total : null };
}

/** Stok gönder (merchantSku ile). Yükleme id'si döner. */
export async function hbUpdateStocks(c: HepsiburadaConfig, items: { key: string; qty: number }[]): Promise<string> {
  const body = items.map((i) => ({ merchantSku: i.key, availableStock: i.qty }));
  const j = await call(c, "POST", `/listings/merchantid/${encodeURIComponent(c.merchantId)}/stock-uploads`, body);
  const id = j?.id ?? j?.Id ?? j?.inventoryUploadId;
  if (!id) throw new HepsiburadaError(0, "Hepsiburada yükleme id'si döndürmedi");
  return String(id);
}

/** Fiyat gönder (merchantSku ile). Yükleme id'si döner. */
export async function hbUpdatePrices(c: HepsiburadaConfig, items: { key: string; price: number }[]): Promise<string> {
  const body = items.map((i) => ({ merchantSku: i.key, price: i.price }));
  const j = await call(c, "POST", `/listings/merchantid/${encodeURIComponent(c.merchantId)}/price-uploads`, body);
  const id = j?.id ?? j?.Id;
  if (!id) throw new HepsiburadaError(0, "Hepsiburada yükleme id'si döndürmedi");
  return String(id);
}

export type HbItemResult = { pos: number | null; key: string | null; reason: string };

/** Yüklemenin sonucu. done=false ise Hepsiburada hâlâ işliyor. errors: yalnız HATALI kalemler. */
export async function hbGetUploadResult(c: HepsiburadaConfig, id: string, kind: "stock" | "price" = "stock"): Promise<{ done: boolean; failedAll: string | null; errors: HbItemResult[] }> {
  const j = await call(c, "GET", `/listings/merchantid/${encodeURIComponent(c.merchantId)}/${kind === "price" ? "price" : "stock"}-uploads/id/${encodeURIComponent(id)}`);
  const status = String(j?.status ?? "").toLowerCase();
  const errors: HbItemResult[] = ((Array.isArray(j?.errors) ? j.errors : []) as any[]).map((e) => ({
    pos: Number.isFinite(Number(e?.elementNo)) ? Number(e.elementNo) : null,
    key: e?.merchantSku ?? null,
    reason: [e?.errorCode, e?.errorMessage ?? e?.message ?? e?.description].filter(Boolean).join(": ") ||
      (Array.isArray(e?.errors) ? e.errors.join("; ") : JSON.stringify(e)),
  }));
  // Fiyat kilidi (MinLock / MaxLock): fiyat platform aralığı dışında → ilan kilitlendi
  for (const v of ((Array.isArray(j?.priceValidations) ? j.priceValidations : []) as any[])) {
    errors.push({
      pos: Number.isFinite(Number(v?.elementNo)) ? Number(v.elementNo) : null,
      key: v?.merchantSku ?? null,
      reason: `${v?.type ?? "Fiyat kilidi"}: ${v?.description ?? ""}${v?.minPrice != null ? ` (aralık ${v.minPrice}–${v.maxPrice})` : ""}`,
    });
  }
  const done = /done|complete|finish|success|fail/.test(status);
  const failedAll = /fail/.test(status) && errors.length === 0 ? `Hepsiburada yüklemesi başarısız (${j?.status})` : null;
  return { done, failedAll, errors };
}
