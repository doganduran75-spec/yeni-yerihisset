/* eslint-disable @typescript-eslint/no-explicit-any */
// Ozon Seller API istemcisi (Ozon Global — Türkiye'den Rusya'ya satış) — yalnız sunucuda.
// Kimlik: "Client-Id" + "Api-Key" başlıkları (Ozon satıcı paneli → Ayarlar → Seller API).
// Belge: https://docs.ozon.com/api/seller/en/
//   Stok:  POST /v2/products/stocks  { stocks: [{ offer_id, stock, warehouse_id }] }
//          istekte en çok 100 ürün-depo çifti · hesapta dakikada 80 istek ·
//          AYNI çift 30 sn'de bir (yoksa kalem hatası TOO_MANY_REQUESTS → biraz sonra tekrar).
//          Yanıt EŞZAMANLI: her kalem için updated + errors (ayrı sonuç sorgusu yok).
//   Depo:  POST /v2/warehouse/list   (v1 2026-04-07'de kapandı)
//   İlan:  POST /v3/product/list     (offer_id listesi; last_id ile sayfalama, sayfa ≤ 1000)

import type { createAdminClient } from "@/lib/supabase-admin";
type AdminClient = ReturnType<typeof createAdminClient>;

const BASE = "https://api-seller.ozon.ru";

export type OzonConfig = {
  enabled: boolean;
  clientId: string;
  apiKey: string;
  warehouseId: string;
  matchField: "sku" | "barcode";
};

export class OzonError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function getOzonConfig(supabase: AdminClient): Promise<OzonConfig> {
  const { data } = await (supabase as any)
    .from("settings")
    .select("ozon_enabled, ozon_client_id, ozon_api_key, ozon_warehouse_id, ozon_match_field")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  return {
    enabled: !!data?.ozon_enabled,
    clientId: String(data?.ozon_client_id || "").trim(),
    apiKey: String(data?.ozon_api_key || "").trim(),
    warehouseId: String(data?.ozon_warehouse_id || "").replace(/\D/g, ""),
    matchField: data?.ozon_match_field === "barcode" ? "barcode" : "sku",
  };
}

/** Bağlantı bilgileri (test / depo listesi için yeterli) */
export const ozHasCredentials = (c: OzonConfig) => !!(c.clientId && c.apiKey);
/** Stok gönderebilmek için depo da seçilmiş olmalı */
export const ozReady = (c: OzonConfig) => ozHasCredentials(c) && !!c.warehouseId;

async function call(c: OzonConfig, path: string, body: unknown) {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: "POST",
      headers: { "Client-Id": c.clientId, "Api-Key": c.apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
      cache: "no-store",
    });
  } catch (e: any) {
    throw new OzonError(0, `Ozon'a bağlanılamadı: ${e?.message || e}`);
  }
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* düz metin */ }
  if (!res.ok) {
    const msg = json?.message || json?.error?.message || text?.slice(0, 300) || res.statusText;
    const hint = res.status === 401 || res.status === 403
      ? " (Client ID / API anahtarını ve anahtarın yetkisini (rolünü) kontrol et; anahtarda IP kısıtı varsa sunucu IP'si izinli olmalı)"
      : res.status === 429 ? " (istek sınırı — biraz sonra tekrar denenecek)" : "";
    throw new OzonError(res.status, `Ozon ${res.status}: ${msg}${hint}`);
  }
  return json;
}

export type OzonWarehouse = { id: string; name: string; status: string; rfbs: boolean };

/** FBS / rFBS / OGL (satıcının kendi) depoları */
export async function ozListWarehouses(c: OzonConfig): Promise<OzonWarehouse[]> {
  const out: OzonWarehouse[] = [];
  let cursor = "";
  for (let i = 0; i < 20; i++) {
    const j = await call(c, "/v2/warehouse/list", { limit: 200, ...(cursor ? { cursor } : {}) });
    for (const w of (j?.warehouses ?? j?.result ?? []) as any[]) {
      out.push({ id: String(w.warehouse_id), name: String(w.name ?? ""), status: String(w.status ?? ""), rfbs: !!w.is_rfbs });
    }
    cursor = j?.cursor ?? "";
    if (!j?.has_next || !cursor) break;
  }
  return out;
}

/** Bağlantı testi: depolar + Ozon'daki ürün sayısı */
export async function ozTestConnection(c: OzonConfig): Promise<{ totalProducts: number | null; warehouses: OzonWarehouse[] }> {
  const warehouses = await ozListWarehouses(c);
  const j = await call(c, "/v3/product/list", { filter: { visibility: "ALL" }, last_id: "", limit: 1 });
  const total = j?.result?.total_items ?? j?.result?.total;
  return { totalProducts: typeof total === "number" ? total : null, warehouses };
}

export type OzonStockResult = { ok: boolean; reason?: string; retry?: boolean };

/** Stok gönder (en çok 100 kalem). Sonuç anahtar (offer_id) başına HEMEN döner. */
export async function ozUpdateStocks(c: OzonConfig, items: { key: string; qty: number }[]): Promise<Map<string, OzonStockResult>> {
  const warehouse_id = Number(c.warehouseId);
  if (!warehouse_id) throw new OzonError(400, "Ozon deposu seçilmemiş (Ayarlar › Entegrasyonlar › Ozon › Depo)");
  const j = await call(c, "/v2/products/stocks", {
    stocks: items.map((i) => ({ offer_id: i.key, stock: Math.max(0, Math.floor(i.qty)), warehouse_id })),
  });
  const out = new Map<string, OzonStockResult>();
  for (const r of (j?.result ?? []) as any[]) {
    const key = String(r?.offer_id ?? "");
    if (!key) continue;
    const errs = (Array.isArray(r?.errors) ? r.errors : []) as any[];
    if (r?.updated && !errs.length) { out.set(key, { ok: true }); continue; }
    const codes = errs.map((e) => String(e?.code ?? "")).join(" ");
    const reason = errs.map((e) => [e?.code, e?.message].filter(Boolean).join(": ")).join("; ") || "Ozon güncellemedi";
    // 30 sn kuralı / anlık yoğunluk → kalıcı hata değil, biraz sonra tekrar
    out.set(key, { ok: false, reason, retry: /TOO_MANY|RATE|LIMIT/i.test(codes) });
  }
  return out;
}

/** İLANDAKİ (arşivlenmemiş) ürünlerin offer_id'leri — ilan eşitleme */
export async function ozListOfferIds(c: OzonConfig): Promise<string[]> {
  const out: string[] = [];
  let lastId = "";
  for (let page = 0; page < 500; page++) {
    const j = await call(c, "/v3/product/list", { filter: { visibility: "ALL" }, last_id: lastId, limit: 1000 });
    const items = (j?.result?.items ?? []) as any[];
    for (const it of items) if (it?.offer_id && !it?.archived) out.push(String(it.offer_id));
    lastId = j?.result?.last_id ?? "";
    if (!items.length || !lastId || items.length < 1000) break;
  }
  return out;
}
