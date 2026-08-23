/**
 * Kargonomi API Client
 * Docs: https://www.kargonomi.com.tr/help/api-dokumantasyonu/kargonomi-api/
 * Base URL: https://app.kargonomi.com.tr/api/v1
 */

const BASE_URL = "https://app.kargonomi.com.tr/api/v1";

/**
 * Token öncelik sırası: parametre > env var
 * Admin panelinden kaydedilen token parametre olarak gelir.
 */
function resolveToken(tokenOverride?: string): string {
  const token = tokenOverride ?? process.env.KARGONOMI_API_TOKEN ?? "";
  if (!token) throw new Error("Kargonomi API token ayarlanmamış. Admin > Ayarlar > Kargonomi bölümünden girin.");
  return token;
}

function authHeaders(token?: string) {
  return {
    Authorization: `Bearer ${resolveToken(token)}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KargonomiState = {
  id: number;
  name: string;
};

export type KargonomiCity = {
  id: number;
  name: string;
  state_id: number;
};

export type CreateShipmentPayload = {
  buyer_name: string;
  buyer_phone: string;
  buyer_address: string;
  buyer_state_id: number;
  buyer_city_id: number;
  warehouse_id: string | number;
  desi: number;
  /** Optional: ref no (e.g. order ID) to appear on label */
  reference_no?: string;
};

export type KargonomiShipmentResult = {
  id: number | string;
  tracking_code: string;
  label_url?: string;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Module-level cache (lives for the lifetime of the Node.js process / Lambda)
// ---------------------------------------------------------------------------

let _statesCache: KargonomiState[] | null = null;
const _citiesCache: Record<number, KargonomiCity[]> = {};

// ---------------------------------------------------------------------------
// Turkish character normalization for fuzzy matching
// ---------------------------------------------------------------------------

export function normalizetr(str: string): string {
  return str
    .toLocaleLowerCase("tr")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .trim();
}

function nameSimilar(a: string, b: string): boolean {
  return normalizetr(a) === normalizetr(b);
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

export async function getStates(token?: string): Promise<KargonomiState[]> {
  if (_statesCache) return _statesCache;

  const res = await fetch(`${BASE_URL}/states`, {
    headers: authHeaders(token),
    next: { revalidate: 86400 }, // 24h — state list changes rarely
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kargonomi /states hatası ${res.status}: ${text}`);
  }

  const json = await res.json();
  // Response may be { states: [...] } or directly an array
  const list: KargonomiState[] = Array.isArray(json) ? json : (json.states ?? json.data ?? []);
  _statesCache = list;
  return list;
}

export async function getCities(stateId: number, token?: string): Promise<KargonomiCity[]> {
  if (_citiesCache[stateId]) return _citiesCache[stateId];

  const res = await fetch(`${BASE_URL}/cities/${stateId}`, {
    headers: authHeaders(token),
    next: { revalidate: 86400 },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kargonomi /cities/${stateId} hatası ${res.status}: ${text}`);
  }

  const json = await res.json();
  const list: KargonomiCity[] = Array.isArray(json) ? json : (json.cities ?? json.data ?? []);
  _citiesCache[stateId] = list;
  return list;
}

/**
 * Verilen şehir adına (ör. "İstanbul") karşılık gelen Kargonomi state ID'sini döner.
 */
export async function findStateId(cityName: string, token?: string): Promise<number> {
  const states = await getStates(token);
  const match = states.find((s) => nameSimilar(s.name, cityName));
  if (!match) {
    throw new Error(`"${cityName}" için Kargonomi il kaydı bulunamadı. Mevcut iller: ${states.map((s) => s.name).join(", ")}`);
  }
  return match.id;
}

/**
 * Verilen ilçe adına karşılık gelen Kargonomi city ID'sini döner.
 */
export async function findCityId(stateId: number, districtName: string, token?: string): Promise<number> {
  const cities = await getCities(stateId, token);
  const match = cities.find((c) => nameSimilar(c.name, districtName));
  if (!match) {
    // Soft-fail: return first city in state instead of crashing the shipment
    console.warn(
      `"${districtName}" ilçesi Kargonomi'de bulunamadı (stateId=${stateId}). İlk ilçe kullanılıyor: ${cities[0]?.name}`
    );
    if (cities.length === 0) throw new Error(`stateId=${stateId} için ilçe listesi boş döndü.`);
    return cities[0].id;
  }
  return match.id;
}

// ---------------------------------------------------------------------------
// Shipment creation
// ---------------------------------------------------------------------------

export async function createShipment(
  payload: CreateShipmentPayload,
  token?: string
): Promise<KargonomiShipmentResult> {
  const warehouseId = payload.warehouse_id ?? process.env.KARGONOMI_WAREHOUSE_ID;
  if (!warehouseId) throw new Error("Kargonomi Depo ID ayarlanmamış. Admin > Ayarlar > Kargonomi bölümünden girin.");

  const body = {
    shipment: {
      buyer_name: payload.buyer_name,
      buyer_phone: payload.buyer_phone,
      buyer_address: payload.buyer_address,
      buyer_state_id: payload.buyer_state_id,
      buyer_city_id: payload.buyer_city_id,
      warehouse_id: warehouseId,
      ...(payload.reference_no ? { reference_no: payload.reference_no } : {}),
      packages: [{ desi: payload.desi }],
    },
  };

  const res = await fetch(`${BASE_URL}/shipments`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = json?.message ?? json?.error ?? JSON.stringify(json);
    throw new Error(`Kargonomi kargo oluşturma hatası ${res.status}: ${msg}`);
  }

  // Response may be { shipment: {...} } or directly the object
  const shipment = json.shipment ?? json.data ?? json;
  return shipment as KargonomiShipmentResult;
}
