/* eslint-disable @typescript-eslint/no-explicit-any */
// Paraşüt API v4 istemcisi — yalnız sunucuda. Belge: https://apidocs.parasut.com (JSONAPI)
//   Kimlik: OAuth2 authorization_code — yönetici Paraşüt'te "izin ver" der, çıkan kodu panele yapıştırır
//   (redirect urn:ietf:wg:oauth:2.0:oob; Paraşüt şifresi sunucuya hiç yazılmaz). access_token 2 saat;
//   refresh_token HER yenilemede değişir → parasut_auth tablosunda saklanır.
//   Hız sınırı: 10 saniyede 10 istek → süreç içinde sıraya alınır, 429'da bekleyip bir kez daha denenir.
//   Uç: https://api.parasut.com/v4/{firma_no}/…

import type { createAdminClient } from "@/lib/supabase-admin";
type Sb = ReturnType<typeof createAdminClient>;

const BASE = "https://api.parasut.com";
export const PARASUT_REDIRECT = "urn:ietf:wg:oauth:2.0:oob";

export class ParasutError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function parasutConfig(sb: Sb) {
  const { data } = await (sb as any).from("settings")
    .select("parasut_enabled, parasut_client_id, parasut_client_secret, parasut_company_id, parasut_shipment_included")
    .order("id").limit(1).maybeSingle();
  return {
    enabled: !!data?.parasut_enabled,
    clientId: String(data?.parasut_client_id || "").trim(),
    clientSecret: String(data?.parasut_client_secret || "").trim(),
    companyId: String(data?.parasut_company_id || "").trim(),
    shipmentIncluded: data?.parasut_shipment_included !== false,
  };
}
export type ParasutConfig = Awaited<ReturnType<typeof parasutConfig>>;

export const authorizeUrl = (clientId: string) =>
  `${BASE}/oauth/authorize?${new URLSearchParams({ client_id: clientId, redirect_uri: PARASUT_REDIRECT, response_type: "code" })}`;

// ── Oturum ──────────────────────────────────────────────────────────────────

async function tokenRequest(form: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(form)) f.append(k, v);
  let res: Response;
  try { res = await fetch(`${BASE}/oauth/token`, { method: "POST", body: f, signal: AbortSignal.timeout(20000), cache: "no-store" }); }
  catch (e: any) { throw new ParasutError(0, `Paraşüt'e bağlanılamadı: ${e?.message || e}`); }
  const j: any = await res.json().catch(() => null);
  if (!res.ok || !j?.access_token) {
    throw new ParasutError(401, `Paraşüt oturumu alınamadı: ${j?.error_description || j?.error || res.status}`);
  }
  return j as { access_token: string; refresh_token: string; expires_in: number };
}

async function saveTokens(sb: Sb, t: { access_token: string; refresh_token: string; expires_in: number }, extra: Record<string, unknown> = {}) {
  await (sb as any).from("parasut_auth").upsert({
    id: 1, access_token: t.access_token, refresh_token: t.refresh_token,
    expires_at: new Date(Date.now() + Number(t.expires_in || 7200) * 1000).toISOString(),
    updated_at: new Date().toISOString(), ...extra,
  });
}

/** Paraşüt'ün verdiği tek kullanımlık kodla bağlan */
export async function connectWithCode(sb: Sb, code: string) {
  const c = await parasutConfig(sb);
  if (!c.clientId || !c.clientSecret) throw new ParasutError(400, "Önce Client ID ve Client Secret'ı kaydet.");
  const t = await tokenRequest({ grant_type: "authorization_code", client_id: c.clientId, client_secret: c.clientSecret, code: code.trim(), redirect_uri: PARASUT_REDIRECT });
  await saveTokens(sb, t, { connected_at: new Date().toISOString() });
  try {
    const me = await rawCall(t.access_token, "GET", "/v4/me");
    await (sb as any).from("parasut_auth").update({ user_email: me?.data?.attributes?.email ?? null }).eq("id", 1);
  } catch { /* bilgi amaçlı */ }
}

export async function disconnect(sb: Sb) {
  await (sb as any).from("parasut_auth").delete().eq("id", 1);
}

// Aynı süreçte eşzamanlı yenileme olmasın (refresh_token tek kullanımlık)
let refreshing: Promise<string> | null = null;
async function accessToken(sb: Sb, c: ParasutConfig): Promise<string> {
  const { data: a } = await (sb as any).from("parasut_auth").select("*").eq("id", 1).maybeSingle();
  if (!a?.refresh_token) throw new ParasutError(401, "Paraşüt bağlı değil (Ayarlar › Entegrasyonlar › Paraşüt › Bağlan).");
  if (a.access_token && a.expires_at && new Date(a.expires_at).getTime() > Date.now() + 5 * 60_000) return a.access_token;
  refreshing ??= (async () => {
    try {
      const t = await tokenRequest({ grant_type: "refresh_token", client_id: c.clientId, client_secret: c.clientSecret, refresh_token: a.refresh_token });
      await saveTokens(sb, t);
      return t.access_token;
    } catch (e) {
      // Başka bir süreç az önce yenilemiş olabilir → kayıtlı yeni token'ı dene
      const { data: b } = await (sb as any).from("parasut_auth").select("access_token, expires_at, refresh_token").eq("id", 1).maybeSingle();
      if (b?.refresh_token !== a.refresh_token && b?.access_token && new Date(b.expires_at).getTime() > Date.now()) return b.access_token;
      throw e;
    } finally { setTimeout(() => { refreshing = null; }, 0); }
  })();
  return refreshing;
}

// ── İstek ───────────────────────────────────────────────────────────────────

const sent: number[] = [];
async function throttle() {
  for (;;) {
    const now = Date.now();
    while (sent.length && now - sent[0] > 10_000) sent.shift();
    if (sent.length < 9) { sent.push(now); return; }
    await new Promise((r) => setTimeout(r, 10_000 - (now - sent[0]) + 50));
  }
}

async function rawCall(token: string, method: string, path: string, body?: unknown, retried = false): Promise<any> {
  await throttle();
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000), cache: "no-store",
    });
  } catch (e: any) {
    throw new ParasutError(0, `Paraşüt'e bağlanılamadı: ${e?.message || e}`);
  }
  if (res.status === 429 && !retried) {
    await new Promise((r) => setTimeout(r, 10_000));
    return rawCall(token, method, path, body, true);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* düz metin */ }
  if (!res.ok) {
    const errs = Array.isArray(json?.errors) ? json.errors.map((e: any) => [e?.title, e?.detail].filter(Boolean).join(": ")).join("; ") : "";
    throw new ParasutError(res.status, `Paraşüt ${res.status}: ${errs || text?.slice(0, 300) || res.statusText}`);
  }
  return json;
}

/** Firma uç noktasına istek: path "/products" → /v4/{firma}/products */
export async function parasutCall(sb: Sb, method: string, path: string, body?: unknown) {
  const c = await parasutConfig(sb);
  if (!c.companyId) throw new ParasutError(400, "Paraşüt firma numarası girilmemiş.");
  const token = await accessToken(sb, c);
  return rawCall(token, method, `/v4/${encodeURIComponent(c.companyId)}${path}`, body);
}

/** Tüm sayfaları gez (JSONAPI page[number] / page[size]) */
async function listAll(sb: Sb, path: string, params: Record<string, string> = {}, max = 400) {
  const out: any[] = [];
  for (let page = 1; page <= max; page++) {
    const q = new URLSearchParams({ ...params, "page[number]": String(page), "page[size]": "25" });
    const j = await parasutCall(sb, "GET", `${path}?${q}`);
    const rows = (j?.data as any[]) || [];
    out.push(...rows);
    const total = Number(j?.meta?.total_pages ?? 0);
    if (!rows.length || (total && page >= total) || rows.length < 25) break;
  }
  return out;
}

// ── Okuma ───────────────────────────────────────────────────────────────────

export async function connectionStatus(sb: Sb) {
  const c = await parasutConfig(sb);
  const { data: a } = await (sb as any).from("parasut_auth").select("connected_at, user_email, expires_at").eq("id", 1).maybeSingle();
  return {
    enabled: c.enabled, hasApp: !!(c.clientId && c.clientSecret), companyId: c.companyId,
    connected: !!a?.connected_at, connectedAt: a?.connected_at ?? null, userEmail: a?.user_email ?? null,
    authorizeUrl: c.clientId ? authorizeUrl(c.clientId) : null,
  };
}

/** Kasa / banka hesapları (tahsilat hesabı seçimi) */
export async function listAccounts(sb: Sb) {
  const rows = await listAll(sb, "/accounts", {}, 20);
  return rows.filter((r) => !r.attributes?.archived).map((r) => ({
    id: String(r.id), name: String(r.attributes?.name ?? r.id), type: r.attributes?.account_type ?? null, currency: r.attributes?.currency ?? null,
  }));
}

/** Satış faturası kategorileri (Paraşüt'te faturadaki "Kategori" — kanal / proje ayrımı) */
export async function listInvoiceCategories(sb: Sb) {
  const rows = await listAll(sb, "/item_categories", { "filter[category_type]": "SalesInvoice" }, 20);
  return rows.filter((r) => !r.attributes?.archived).map((r) => ({ id: String(r.id), name: String(r.attributes?.full_path || r.attributes?.name || r.id) }));
}

const KEY = (v: unknown) => String(v ?? "").trim().toUpperCase();

/** Paraşüt ürünlerini çek (parasut_products) ve site numaralarıyla eşleştir: barkod → SKU, Paraşüt'te kod ya da barkod */
export async function syncProducts(sb: Sb) {
  const rows = await listAll(sb, "/products");
  const now = new Date().toISOString();
  const list = rows.map((r) => ({
    parasut_id: String(r.id), code: r.attributes?.code ?? null, barcode: r.attributes?.barcode ?? null, name: r.attributes?.name ?? null,
    vat_rate: r.attributes?.vat_rate ?? null, stock_count: r.attributes?.stock_count ?? null, archived: !!r.attributes?.archived, synced_at: now,
  }));
  const s = sb as any;
  for (let i = 0; i < list.length; i += 500) await s.from("parasut_products").upsert(list.slice(i, i + 500));
  if (list.length) await s.from("parasut_products").delete().lt("synced_at", now);
  return { count: list.length, ...(await matchProducts(sb)) };
}

/** Eşleştirme (Paraşüt'e istek atmaz): barkod önce, sonra SKU; Paraşüt tarafında kod ya da barkod alanı */
export async function matchProducts(sb: Sb) {
  const s = sb as any;
  const pp: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await s.from("parasut_products").select("parasut_id, code, barcode, archived").range(from, from + 999);
    pp.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const alive = new Set(pp.filter((x) => !x.archived).map((x) => x.parasut_id));
  const byKey = new Map<string, string[]>();
  for (const p of pp.filter((x) => !x.archived)) for (const k of new Set([KEY(p.code), KEY(p.barcode)])) if (k) byKey.set(k, [...(byKey.get(k) || []), p.parasut_id]);
  const find = (...keys: unknown[]) => {
    for (const k of keys.map(KEY).filter(Boolean)) {
      const ids = [...new Set(byKey.get(k) || [])];
      if (ids.length === 1) return { id: ids[0] };
      if (ids.length > 1) return { conflict: k };
    }
    return null;
  };
  const vs: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await s.from("product_variants").select("id, sku, barcode, parasut_product_id").range(from, from + 999);
    vs.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  let matched = 0, unmatched = 0;
  const conflicts: string[] = [];
  for (const v of vs) {
    const m = find(v.barcode, v.sku);
    // Kodla bulunamazsa elle yapılmış eşleşme (Paraşüt'te hâlâ varsa) korunur
    const id = (m && "id" in m ? m.id : null) ?? (v.parasut_product_id && alive.has(v.parasut_product_id) ? v.parasut_product_id : null);
    if (m && "conflict" in m) conflicts.push(m.conflict!);
    if (id) matched++; else unmatched++;
    if ((v.parasut_product_id ?? null) !== id) await s.from("product_variants").update({ parasut_product_id: id }).eq("id", v.id);
  }
  return { matched, unmatched, conflicts: [...new Set(conflicts)].slice(0, 50) };
}

/** "Mevcutları güncelle": eşleşen Paraşüt ürününün kodu = site SKU, barkodu = site barkodu */
export async function pushCodesToParasut(sb: Sb, variantIds: string[]) {
  const s = sb as any;
  const { data: vs } = await s.from("product_variants").select("id, sku, barcode, parasut_product_id").in("id", variantIds.slice(0, 60));
  let updated = 0;
  const errors: string[] = [];
  for (const v of (vs as any[]) || []) {
    if (!v.parasut_product_id) continue;
    const attributes: Record<string, string> = {};
    if (v.sku) attributes.code = v.sku;
    if (v.barcode) attributes.barcode = v.barcode;
    if (!Object.keys(attributes).length) continue;
    try {
      await parasutCall(sb, "PATCH", `/products/${v.parasut_product_id}`, { data: { id: v.parasut_product_id, type: "products", attributes } });
      await s.from("parasut_products").update({ code: attributes.code ?? undefined, barcode: attributes.barcode ?? undefined }).eq("parasut_id", v.parasut_product_id);
      updated++;
    } catch (e: any) {
      errors.push(`${v.sku || v.barcode}: ${e?.message || e}`);
      if (e instanceof ParasutError && [0, 401, 403].includes(e.status)) break;
    }
  }
  return { updated, errors };
}
