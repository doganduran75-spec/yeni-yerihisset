/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Basit Kargo API istemcisi — yalnız sunucuda. Belge: https://basitkargo.com/api
 * Akış (src/lib/kargonomi-flow.ts, sağlayıcı "basitkargo"): POST /v2/order (NEW) → GET /v2/order/{id}/fee
 * (firma fiyatları) → POST /v2/order/{id}/barcode {handlerCode} (READY_TO_SHIP + takip kodu) → GET /v2/order/{id}.
 * Durum değişince webhook (/api/basitkargo/webhook) — yük güvenilmez, sipariş API'den yeniden okunur.
 * İlk gerçek denemede yanıt şekillerini doğrula (belgede barkod yanıtı ayrıca tanımlı değil).
 */

const BASE_URL = "https://basitkargo.com/api";

export class BasitKargoError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call(token: string, method: string, path: string, opts?: { json?: unknown; timeoutMs?: number; idem?: string; raw?: boolean }) {
  if (!token) throw new BasitKargoError(0, "Basit Kargo API token ayarlanmamış (Ayarlar › Entegrasyonlar › Basit Kargo).");
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: opts?.raw ? "*/*" : "application/json" };
  if (opts?.json !== undefined) headers["Content-Type"] = "application/json";
  if (opts?.idem) headers["Idempotency-Key"] = opts.idem;
  let res: Response;
  try {
    res = await fetch(BASE_URL + path, {
      method, headers, body: opts?.json !== undefined ? JSON.stringify(opts.json) : undefined,
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 25000), cache: "no-store",
    });
  } catch (e: any) {
    throw new BasitKargoError(0, `Basit Kargo'ya bağlanılamadı: ${e?.message || e}`);
  }
  if (opts?.raw && res.ok) return res;
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* düz metin */ }
  if (!res.ok) {
    const msg = json?.message || json?.error || (Array.isArray(json?.errors) ? json.errors.map((x: any) => x?.message || x).join("; ") : "") || text?.slice(0, 300) || res.statusText;
    const hint = res.status === 401 ? " (API token geçersiz)" : res.status === 429 ? " (çok sık istek — biraz sonra dene)" : "";
    throw new BasitKargoError(res.status, `Basit Kargo ${res.status}: ${msg}${hint}`);
  }
  return json;
}

// ── Hesap ───────────────────────────────────────────────────────────────────

export type BkFirmStatus = { status?: string; statusLabel?: string; approved?: boolean; accountTypeLabel?: string; summary?: string };
export const firmStatus = (token: string): Promise<BkFirmStatus> => call(token, "GET", "/firm/status");
export const firmBalance = async (token: string): Promise<number | null> => {
  const j = await call(token, "GET", "/firm/balance");
  const n = Number(typeof j === "object" && j ? j.balance ?? j.amount : j);
  return Number.isFinite(n) ? n : null;
};
export type BkAddress = { id: string; name?: string; city?: string; town?: string; address?: string };
export const firmAddresses = async (token: string): Promise<BkAddress[]> => {
  const j = await call(token, "GET", "/firm/address");
  return ((Array.isArray(j) ? j : j?.content ?? j?.data ?? []) as any[]).map((a) => ({ id: String(a.id), name: a.name, city: a.city, town: a.town, address: a.address }));
};

// ── Sipariş ─────────────────────────────────────────────────────────────────

export type BkOrder = {
  id: string;
  barcode?: string | null;
  status?: string;
  validationFailed?: boolean;
  shipmentInfo?: { handler?: { name?: string; code?: string }; handlerShipmentCode?: string | null; lastState?: string } | null;
  [k: string]: unknown;
};

export type NewBkOrder = {
  orderTotal: number;
  orderPaymentType: "BANK_TRANSFER" | "CREDIT_CARD" | "OTHER";
  addressId?: string;
  content: { name: string; code: string; items: { name: string; code?: string; quantity: number }[]; packages: { height: number; width: number; depth: number; weight: number }[] };
  client: { name: string; phone: string; email?: string; city: string; town: string; address: string };
};

/** Gönderi taslağı (NEW) — firma seçilmeden */
export async function createOrder(token: string, o: NewBkOrder): Promise<BkOrder> {
  const j = await call(token, "POST", "/v2/order", { json: { type: "OUTGOING", orderPaymentStatus: "PAID", ...o } });
  if (!j?.id) throw new BasitKargoError(502, "Basit Kargo gönderi numarası dönmedi");
  if (j.validationFailed) throw new BasitKargoError(422, "Basit Kargo adresi doğrulayamadı — sipariş adresindeki il / ilçe / açık adresi kontrol et.");
  return { ...j, id: String(j.id) };
}

export type BkOffer = { id: string; name: string; price: string | null; amount: number | null };

/** Firma fiyatları (ucuzdan pahalıya; kapalı firma = fiyatsız) */
export async function getFees(token: string, orderId: string): Promise<BkOffer[]> {
  const j = await call(token, "GET", `/v2/order/${encodeURIComponent(orderId)}/fee`);
  const list = (Array.isArray(j) ? j : j?.content ?? j?.data ?? []) as any[];
  return list.map((f) => {
    const fee = Number(f.fee);
    const off = f.disabled === true || !Number.isFinite(fee);
    const dur = Number(f.duration) > 0 ? ` · ~${f.duration} gün` : "";
    return { id: String(f.handlerCode), name: String(f.handler || f.handlerCode), price: off ? null : `${fee.toFixed(2)} ₺${dur}`, amount: off ? null : fee };
  });
}

/** Seçilen firmayla barkod (90 sn'ye kadar sürebilir) */
export async function createBarcode(token: string, orderId: string, handlerCode: string, idem: string): Promise<BkOrder> {
  return call(token, "POST", `/v2/order/${encodeURIComponent(orderId)}/barcode`, { json: { handlerCode }, timeoutMs: 90000, idem });
}

export const getOrder = (token: string, orderId: string): Promise<BkOrder> => call(token, "GET", `/v2/order/${encodeURIComponent(orderId)}`);

/** Barkodu iptal (sipariş NEW'e döner, ücret iade) → sonra NEW sipariş silinir */
export async function cancelBarcode(token: string, barcode: string) { return call(token, "DELETE", `/order/barcode/${encodeURIComponent(barcode)}`); }
export async function deleteOrder(token: string, orderId: string) { return call(token, "DELETE", `/order/${encodeURIComponent(orderId)}`); }

/** Teslim edilmiş gönderi için iade kodu */
export async function createReturnCode(token: string, barcode: string): Promise<{ code: string | null; raw: any }> {
  const j = await call(token, "GET", `/v2/order/return/barcode/${encodeURIComponent(barcode)}`);
  const code = String(j?.shipmentInfo?.handlerShipmentCode || j?.barcode || j?.code || (typeof j === "string" ? j : "") || "").trim() || null;
  return { code, raw: j };
}

/** Resmî etiket (SVG) */
export async function getLabelSvg(token: string, orderId: string): Promise<string> {
  const res = (await call(token, "GET", `/label/svg/${encodeURIComponent(orderId)}`, { raw: true })) as Response;
  return res.text();
}

/** Müşterinin takip edeceği kod: kargo firmasının takip numarası (yoksa Basit Kargo barkodu) */
export const trackingOf = (o: BkOrder) => String(o.shipmentInfo?.handlerShipmentCode || "").trim() || null;
export const providerOf = (o: BkOrder) => String(o.shipmentInfo?.handler?.name || "").trim() || null;

export const STATUS_LABEL: Record<string, string> = {
  NEW: "Yeni (firma seçilmedi)", READY_TO_SHIP: "Kargoya hazır", SHIPPED: "Kargoda", OUT_FOR_DELIVERY: "Dağıtımda",
  DELIVERED: "Teslim edildi", NEEDS_SUPPORT: "Destek gerekiyor", DELAYED: "Gecikmede", RETURNING: "İade yolunda",
  RETURNED: "Gönderene iade edildi", LOST: "Kayıp",
};
/** Yöneticinin bakması gereken durumlar (siparişe hata olarak yazılır → bekleyen işler + Telegram) */
export const PROBLEM_STATUSES = ["NEEDS_SUPPORT", "RETURNING", "RETURNED", "LOST"];
export const MOVING_STATUSES = ["SHIPPED", "OUT_FOR_DELIVERY", "DELAYED"];

/** desi → tek koli (küp; ağırlık = desi kg — fiyat desi/kg büyüğünden) */
export function packageOf(desi: number) {
  const side = Math.max(1, Math.round(Math.cbrt(desi * 3000)));
  return { height: side, width: side, depth: side, weight: desi };
}
