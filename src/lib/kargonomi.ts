/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Kargonomi API istemcisi — yalnız sunucuda.
 * Belge: https://www.kargonomi.com.tr/help/api-dokumantasyonu/kargonomi-api/
 * Akış (src/lib/kargonomi-flow.ts): POST /shipments (taslak) → GET /shipment-price-comparison/{id}
 * (firma teklifleri) → POST /confirm-shipping-price (seçilen firma; form verisi) → GET /shipments/{id}
 * ile kargo kodu gelene kadar sorgu. Token panelde yok; Kargonomi destekten istenir.
 */

const BASE_URL = "https://app.kargonomi.com.tr/api/v1";

export class KargonomiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call(token: string, method: string, path: string, body?: { json?: unknown; form?: Record<string, string> }) {
  if (!token) throw new KargonomiError(0, "Kargonomi API token ayarlanmamış (Ayarlar › Entegrasyonlar › Kargonomi).");
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  let payload: BodyInit | undefined;
  if (body?.json !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body.json); }
  else if (body?.form) { const f = new FormData(); for (const [k, v] of Object.entries(body.form)) f.append(k, v); payload = f; }
  let res: Response;
  try {
    res = await fetch(BASE_URL + path, { method, headers, body: payload, signal: AbortSignal.timeout(25000), cache: "no-store" });
  } catch (e: any) {
    throw new KargonomiError(0, `Kargonomi'ye bağlanılamadı: ${e?.message || e}`);
  }
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* düz metin */ }
  if (!res.ok) {
    const errs = json?.errors && typeof json.errors === "object" ? Object.values(json.errors).flat().join("; ") : "";
    const msg = errs || json?.message || json?.error || text?.slice(0, 300) || res.statusText;
    const hint = res.status === 401 ? " (API token geçersiz)" : "";
    throw new KargonomiError(res.status, `Kargonomi ${res.status}: ${msg}${hint}`);
  }
  return json;
}

// Yanıt bazen { data: … } / { shipment: … } sarmalı
const unwrap = (j: any, key?: string) => (key && j?.[key]) ?? j?.data?.[key ?? ""] ?? j?.data ?? j;

// ── İl / ilçe ───────────────────────────────────────────────────────────────

type Named = { id: number; name: string };
let statesCache: Named[] | null = null;
const citiesCache: Record<number, Named[]> = {};

export function normalizetr(str: string): string {
  return String(str || "").toLocaleLowerCase("tr")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/i̇/g, "i").trim();
}
const listOf = (j: any, key: string): Named[] => (Array.isArray(j) ? j : j?.[key] ?? j?.data ?? []);

export async function findStateId(token: string, cityName: string): Promise<number> {
  statesCache ??= listOf(await call(token, "GET", "/states"), "states");
  const m = statesCache.find((s) => normalizetr(s.name) === normalizetr(cityName));
  if (!m) throw new KargonomiError(422, `"${cityName}" ili Kargonomi'de bulunamadı — sipariş adresindeki ili kontrol et.`);
  return m.id;
}

export async function findCityId(token: string, stateId: number, districtName: string): Promise<number> {
  citiesCache[stateId] ??= listOf(await call(token, "GET", `/cities/${stateId}`), "cities");
  const m = citiesCache[stateId].find((c) => normalizetr(c.name) === normalizetr(districtName));
  // İlçe adı tutmazsa merkez ilçeyi seçmek yanlış adrese gönderir → dur, yöneticiye söyle
  if (!m) throw new KargonomiError(422, `"${districtName}" ilçesi Kargonomi'de bulunamadı — sipariş adresindeki ilçeyi kontrol et.`);
  return m.id;
}

// ── Gönderi ─────────────────────────────────────────────────────────────────

export type KargonomiShipment = {
  id: number | string;
  status?: string;
  status_label?: string;
  shipping_provider_name?: string | null;
  shipping_webservice_tracking_code?: string | null;
  shipping_webservice_barcode?: string | null;
  [k: string]: unknown;
};

export type KargonomiOffer = { id: string; name: string; price: string | null; amount: number | null };

export type NewShipment = {
  buyer_name: string; buyer_phone: string; buyer_email?: string; buyer_address: string;
  buyer_state_id: number; buyer_city_id: number; warehouse_id: number; desi: number; content?: string;
};

/** Taslak gönderi (firma seçilmeden) */
export async function createShipment(token: string, s: NewShipment): Promise<KargonomiShipment> {
  const { desi, content, ...rest } = s;
  const j = await call(token, "POST", "/shipments", {
    json: { shipment: { ...rest, packages: [{ desi, ...(content ? { content } : {}) }] } },
  });
  const sh = unwrap(j, "shipment");
  if (!sh?.id) throw new KargonomiError(502, "Kargonomi gönderi numarası dönmedi");
  return sh;
}

/** "22.67 + KDV" → 22.67; "Hizmet Dışı Bölge" → null */
function priceAmount(p: unknown): number | null {
  const m = String(p ?? "").replace(",", ".").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** Firma teklifleri (fiyatı olmayan = hizmet dışı; "Otomatik" = en ucuz) */
export async function getOffers(token: string, shipmentId: string | number): Promise<KargonomiOffer[]> {
  const j = await call(token, "GET", `/shipment-price-comparison/${shipmentId}`);
  const list = (j?.shipping_provider_with_price ?? j?.data?.shipping_provider_with_price ?? []) as any[];
  return list.map((o) => ({ id: String(o.id), name: String(o.name ?? o.slug ?? o.id), price: o.price == null ? null : String(o.price), amount: priceAmount(o.price) }));
}

/** Seçilen firmayla gönderiyi onayla (providerId "-1" = en ucuz) */
export async function confirmProvider(token: string, shipmentId: string | number, providerId: string): Promise<KargonomiShipment> {
  const j = await call(token, "POST", "/confirm-shipping-price", { form: { shipment_id: String(shipmentId), shipping_provider_id: String(providerId) } });
  return unwrap(j, "shipment");
}

export async function getShipment(token: string, shipmentId: string | number): Promise<KargonomiShipment> {
  return unwrap(await call(token, "GET", `/shipments/${shipmentId}`), "shipment");
}

/** Taslak → sil; onaylanmış (kargoya verilmemiş) → iptal talebi */
export async function cancelShipment(token: string, shipmentId: string | number, draft: boolean) {
  if (draft) return call(token, "DELETE", `/shipments/${shipmentId}`);
  return call(token, "POST", "/shipments/cancel", { json: { shipment_id: String(shipmentId) } });
}

/** Kargo firmasının verdiği takip kodu (yoksa barkod) */
export const trackingOf = (s: KargonomiShipment) =>
  String(s.shipping_webservice_tracking_code || s.shipping_webservice_barcode || "").trim() || null;

export const FAILED_STATUSES = ["webservice_order_failed", "cancelled", "request_for_cancellation"];

/** Türkiye cep / sabit: 10 hane (başında 0 / 90 olmadan) */
export function phone10(p: unknown): string {
  let d = String(p ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("90")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
}
