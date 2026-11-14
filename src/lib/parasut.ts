/* eslint-disable @typescript-eslint/no-explicit-any */
// Paraşüt API v4 istemcisi — yalnız sunucuda. Belge: https://apidocs.parasut.com (JSONAPI)
//   Kimlik (2026-11 Paraşüt duyurusu; eski yöntem 10 Aralık 2026'da kapanır):
//   • YENİ: id.parasut.com (OpenID Connect) — Authorization Code + PKCE + state. DevHub client'ı (parasut_v2_*).
//     Panelde "Paraşüt ile bağlan" → Paraşüt girişi + onay → /admin/parasut/baglan'a döner (kod yapıştırma yok).
//     refresh_token ~30 gün; kullanılmazsa düşer → parasutKeepAlive birkaç günde bir yeniler.
//   • ESKİ: api.parasut.com/oauth, kod yapıştırma (redirect urn:ietf:wg:oauth:2.0:oob). Geçiş paralel: yeniden
//     bağlanılana kadar çalışır (parasut_auth.issuer boş = eski).
//   Paraşüt şifresi sunucuya hiç yazılmaz. access_token 2 saat; refresh_token yenilemede değişebilir → parasut_auth.
//   Hız sınırı: 10 saniyede 10 istek → süreç içinde sıraya alınır, 429'da bekleyip bir kez daha denenir.
//   Uç: https://api.parasut.com/v4/{firma_no}/…

import { createHash, randomBytes } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase-admin";
type Sb = ReturnType<typeof createAdminClient>;

const BASE = "https://api.parasut.com";
export const PARASUT_REDIRECT = "urn:ietf:wg:oauth:2.0:oob";
// Yeni kimlik altyapısı (DevHub OAuth rehberi)
const ID_BASE = "https://id.parasut.com/realms/parasut/protocol/openid-connect";
export const PARASUT_CALLBACK = "/admin/parasut/baglan";
// DevHub başvurusundaki dönüş adresleri (en fazla 3, sonradan değişmez) — yalnız bunlardan bağlanılır
export const PARASUT_ORIGINS = ["https://dev.yerihisset.com", "https://www.yerihisset.com", "https://yerihisset.com"];
const RECONNECT = "Paraşüt bağlantısı sona erdi ya da izin geri alındı — Ayarlar › Entegrasyonlar › Paraşüt › “Paraşüt ile bağlan”.";

export class ParasutError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function parasutConfig(sb: Sb) {
  const { data } = await (sb as any).from("settings")
    .select("parasut_enabled, parasut_client_id, parasut_client_secret, parasut_v2_client_id, parasut_v2_client_secret, parasut_company_id, parasut_shipment_included")
    .order("id").limit(1).maybeSingle();
  return {
    enabled: !!data?.parasut_enabled,
    clientId: String(data?.parasut_client_id || "").trim(),
    clientSecret: String(data?.parasut_client_secret || "").trim(),
    v2ClientId: String(data?.parasut_v2_client_id || "").trim(),
    v2ClientSecret: String(data?.parasut_v2_client_secret || "").trim(),
    companyId: String(data?.parasut_company_id || "").trim(),
    shipmentIncluded: data?.parasut_shipment_included !== false,
  };
}
export type ParasutConfig = Awaited<ReturnType<typeof parasutConfig>>;

export const authorizeUrl = (clientId: string) =>
  `${BASE}/oauth/authorize?${new URLSearchParams({ client_id: clientId, redirect_uri: PARASUT_REDIRECT, response_type: "code" })}`;

// ── Oturum ──────────────────────────────────────────────────────────────────

type Tokens = { access_token: string; refresh_token?: string; expires_in: number; refresh_expires_in?: number; scope?: string };

/** issuer "id" = id.parasut.com (form-urlencoded); diğeri eski api.parasut.com/oauth */
async function tokenRequest(form: Record<string, string>, issuer: string | null = null): Promise<Tokens> {
  const id = issuer === "id";
  let res: Response;
  try {
    res = id
      ? await fetch(`${ID_BASE}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body: new URLSearchParams(form).toString(), signal: AbortSignal.timeout(20000), cache: "no-store" })
      : await fetch(`${BASE}/oauth/token`, { method: "POST", body: (() => { const f = new FormData(); for (const [k, v] of Object.entries(form)) f.append(k, v); return f; })(),
          signal: AbortSignal.timeout(20000), cache: "no-store" });
  } catch (e: any) { throw new ParasutError(0, `Paraşüt'e bağlanılamadı: ${e?.message || e}`); }
  const j: any = await res.json().catch(() => null);
  if (!res.ok || !j?.access_token) {
    // Paraşüt'ün kendi açıklaması da yazılsın (neden düştüğünü görmek için: süre / oturum kapandı / yeniden kullanım)
    if (j?.error === "invalid_grant" && form.grant_type === "refresh_token") throw new ParasutError(401, `${RECONNECT}${j?.error_description ? ` (Paraşüt: ${j.error_description})` : ""}`);
    throw new ParasutError(401, `Paraşüt oturumu alınamadı: ${j?.error_description || j?.error || res.status}`);
  }
  return j as Tokens;
}

async function saveTokens(sb: Sb, t: Tokens, extra: Record<string, unknown> = {}, prevRefresh?: string) {
  await (sb as any).from("parasut_auth").upsert({
    id: 1, access_token: t.access_token, refresh_token: t.refresh_token || prevRefresh || null,
    expires_at: new Date(Date.now() + Number(t.expires_in || 7200) * 1000).toISOString(),
    // Süresiz (offline_access) oturumda refresh_expires_in 0 gelir → bitiş tarihi yok
    ...(t.refresh_expires_in != null ? { refresh_expires_at: Number(t.refresh_expires_in) > 0 ? new Date(Date.now() + Number(t.refresh_expires_in) * 1000).toISOString() : null } : {}),
    last_error: null, last_error_at: null,
    updated_at: new Date().toISOString(), ...extra,
  });
}

const b64url = (b: Buffer) => b.toString("base64url");

/** Süresiz (offline) oturum mu? Kesin işaret yenileme anahtarının türü (JWT typ "Offline"); yedekler: scope'ta
 *  offline_access ya da refresh_expires_in = 0. (2026-11-14: eski denetimdeki düzenli ifade bozuk yazılmıştı — kelime
 *  sınırı yerine görünmez karakter — hiç eşleşmiyor, süresiz oturum alınsa da panel "Normal oturum" diyordu.) */
export function isOfflineToken(t: { scope?: string | null; refresh_token?: string | null; refresh_expires_in?: number | string | null }): boolean {
  if (String(t.scope || "").split(/\s+/).includes("offline_access")) return true;
  try {
    const part = String(t.refresh_token || "").split(".")[1];
    if (part && String(JSON.parse(Buffer.from(part, "base64url").toString("utf8"))?.typ || "").toLowerCase() === "offline") return true;
  } catch { /* JWT değil */ }
  return t.refresh_expires_in != null && t.refresh_expires_in !== "" && Number(t.refresh_expires_in) === 0;
}

/** Yeni altyapı: Paraşüt giriş + onay adresini üret (PKCE). origin = panelin açıldığı adres (dönüş oraya). */
export async function startAuthorize(sb: Sb, origin: string) {
  const c = await parasutConfig(sb);
  if (!c.v2ClientId || !c.v2ClientSecret) throw new ParasutError(400, "Önce DevHub'dan aldığın yeni Client ID ve Client Secret'ı kaydet.");
  const o = String(origin || "").replace(/\/+$/, "");
  if (!PARASUT_ORIGINS.includes(o)) throw new ParasutError(400, `Bu adresten bağlanılamaz (${o || "?"}) — dev.yerihisset.com ya da yerihisset.com üzerinden bağlan.`);
  const verifier = b64url(randomBytes(48)); // 64 karakter (43–128)
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(24));
  const redirect = o + PARASUT_CALLBACK;
  // Süresiz oturum (offline_access): Paraşüt giriş oturumu kapansa da ("Session not active", 2026-11-10) bağlantı yaşar.
  // Paraşüt bir kez reddettiyse (offline_denied) normal oturum istenir.
  const { data: prev } = await (sb as any).from("parasut_auth").select("offline_denied").eq("id", 1).maybeSingle();
  const scope = prev?.offline_denied ? "openid" : "openid offline_access";
  await (sb as any).from("parasut_auth").upsert({ id: 1, pending_state: state, pending_verifier: verifier, pending_redirect: redirect, pending_at: new Date().toISOString() });
  return `${ID_BASE}/auth?${new URLSearchParams({
    client_id: c.v2ClientId, redirect_uri: redirect, response_type: "code", scope, state,
    code_challenge: challenge, code_challenge_method: "S256", kc_idp_hint: "parasut",
  })}`;
}

/** Yeni altyapı: Paraşüt'ten dönen kodla bağlan (state + PKCE doğrulanır) */
export async function connectWithOidc(sb: Sb, code: string, state: string) {
  const c = await parasutConfig(sb);
  if (!c.v2ClientId || !c.v2ClientSecret) throw new ParasutError(400, "Yeni Client ID / Secret kayıtlı değil.");
  const { data: a } = await (sb as any).from("parasut_auth").select("pending_state, pending_verifier, pending_redirect, pending_at, last_error, last_error_at").eq("id", 1).maybeSingle();
  if (!a?.pending_state || a.pending_state !== state) throw new ParasutError(400, "Bağlanma isteği eşleşmedi — panelden yeniden “Paraşüt ile bağlan”a bas.");
  if (!a.pending_at || Date.now() - new Date(a.pending_at).getTime() > 15 * 60_000) throw new ParasutError(400, "Bağlanma isteğinin süresi doldu — panelden yeniden “Paraşüt ile bağlan”a bas.");
  let t: Tokens;
  try {
    t = await tokenRequest({ grant_type: "authorization_code", client_id: c.v2ClientId, client_secret: c.v2ClientSecret,
      code: code.trim(), redirect_uri: a.pending_redirect, code_verifier: a.pending_verifier }, "id");
  } catch (e: any) {
    // Paraşüt süresiz oturuma izin vermiyorsa ("Offline tokens not allowed …") bir dahaki bağlanma normal oturumla
    if (/offline/i.test(String(e?.message))) { await markOfflineDenied(sb); throw new ParasutError(400, "Paraşüt süresiz oturuma izin vermedi — bir kez daha “Paraşüt ile bağlan”a bas (normal oturumla bağlanır)."); }
    throw e;
  }
  if (!t.refresh_token) throw new ParasutError(502, "Paraşüt yenileme anahtarı (refresh_token) vermedi — DevHub başvurusunu kontrol et.");
  await saveTokens(sb, t, { issuer: "id", connected_at: new Date().toISOString(), user_email: null,
    offline: isOfflineToken(t),
    // Son kopmanın nedeni yeniden bağlanınca kaybolmasın (panelde "Son kopma")
    ...(a.last_error ? { last_drop_error: a.last_error, last_drop_at: a.last_error_at || new Date().toISOString() } : {}),
    pending_state: null, pending_verifier: null, pending_redirect: null, pending_at: null });
  try {
    const me = await rawCall(t.access_token, "GET", "/v4/me");
    await (sb as any).from("parasut_auth").update({ user_email: me?.data?.attributes?.email ?? null }).eq("id", 1);
  } catch { /* bilgi amaçlı */ }
}

/** Paraşüt süresiz oturumu (offline_access) reddetti → sonraki bağlanmada normal oturum istenir */
export async function markOfflineDenied(sb: Sb) {
  await (sb as any).from("parasut_auth").upsert({ id: 1, offline_denied: true });
}

/** Paraşüt'ün verdiği tek kullanımlık kodla bağlan */
export async function connectWithCode(sb: Sb, code: string) {
  const c = await parasutConfig(sb);
  if (!c.clientId || !c.clientSecret) throw new ParasutError(400, "Önce Client ID ve Client Secret'ı kaydet.");
  const t = await tokenRequest({ grant_type: "authorization_code", client_id: c.clientId, client_secret: c.clientSecret, code: code.trim(), redirect_uri: PARASUT_REDIRECT });
  await saveTokens(sb, t, { connected_at: new Date().toISOString(), issuer: null });
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
async function accessToken(sb: Sb, c: ParasutConfig, force = false): Promise<string> {
  const { data: a } = await (sb as any).from("parasut_auth").select("*").eq("id", 1).maybeSingle();
  if (!a?.refresh_token) throw new ParasutError(401, "Paraşüt bağlı değil (Ayarlar › Entegrasyonlar › Paraşüt › Bağlan).");
  if (!force && a.access_token && a.expires_at && new Date(a.expires_at).getTime() > Date.now() + 5 * 60_000) return a.access_token;
  // Bağlantının türüne göre: yeni (id.parasut.com, DevHub client) ya da eski (api.parasut.com, eski client)
  const id = a.issuer === "id";
  const [cid, csec] = id ? [c.v2ClientId, c.v2ClientSecret] : [c.clientId, c.clientSecret];
  refreshing ??= (async () => {
    // SÜREÇLER ARASI KİLİT (2026-11-08): site pm2 cluster'da 4 işlem. refresh_token tek kullanımlık — iki işlem (ör. dakikalık
    // iş + paneldeki "Faturayı kes") aynı anda aynı token'la yenilerse Paraşüt (id.parasut.com) bunu çalıntı sayıp OTURUMU
    // KAPATIR → "bağlantı sona erdi". Kilidi alan yeniler; diğerleri yeni token'ı bekler (en çok ~25 sn).
    const lockFree = `refresh_lock_until.is.null,refresh_lock_until.lt."${new Date().toISOString()}"`;
    const { data: claim } = await (sb as any).from("parasut_auth")
      .update({ refresh_lock_until: new Date(Date.now() + 30_000).toISOString() })
      .eq("id", 1).eq("refresh_token", a.refresh_token).or(lockFree).select("id");
    try {
      if (!claim?.length) {
        for (let i = 0; i < 25; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          const { data: b } = await (sb as any).from("parasut_auth").select("access_token, expires_at, refresh_token, last_error, refresh_lock_until").eq("id", 1).maybeSingle();
          if (!b?.refresh_token) throw new ParasutError(401, "Paraşüt bağlı değil (Ayarlar › Entegrasyonlar › Paraşüt › Bağlan).");
          if (b.refresh_token !== a.refresh_token && b.access_token && new Date(b.expires_at).getTime() > Date.now()) return b.access_token as string;
          // Kilidi alan yenileyemedi (hata yazdı) ya da kilit bırakıldı → bekleme biter
          if (b.refresh_token === a.refresh_token && (!b.refresh_lock_until || new Date(b.refresh_lock_until).getTime() < Date.now())) {
            if (b.last_error) throw new ParasutError(401, b.last_error);
            break;
          }
        }
        throw new ParasutError(503, "Paraşüt oturumu şu an yenileniyor — birkaç saniye sonra tekrar dene.");
      }
      try {
        const t = await tokenRequest({ grant_type: "refresh_token", client_id: cid, client_secret: csec, refresh_token: a.refresh_token }, a.issuer);
        await saveTokens(sb, t, { refresh_lock_until: null }, a.refresh_token);
        return t.access_token;
      } catch (e: any) {
        // Panelde ("Bağlantı koptu" + yeniden bağlan) ve Telegram'da (entegrasyon hatası) görünsün; kilidi bırak
        await (sb as any).from("parasut_auth").update({ last_error: String(e?.message || e).slice(0, 300), last_error_at: new Date().toISOString(), refresh_lock_until: null }).eq("id", 1);
        throw e;
      }
    } finally { setTimeout(() => { refreshing = null; }, 0); }
  })();
  return refreshing;
}

/** Yeni altyapıda refresh_token ~30 gün kullanılmazsa düşer: fatura kesilmeyen sakin günlerde de oturum taze kalsın
 *  (dakikalık işleyicide saatte bir çağrılır; son yenilemeden 3 gün geçtiyse yeniler). */
export async function parasutKeepAlive(sb: Sb) {
  const { data: a } = await (sb as any).from("parasut_auth").select("issuer, refresh_token, updated_at, last_error").eq("id", 1).maybeSingle();
  if (!a?.refresh_token || a.issuer !== "id") return { refreshed: false };
  if (Date.now() - new Date(a.updated_at).getTime() < 3 * 86400_000) return { refreshed: false };
  const c = await parasutConfig(sb);
  if (!c.enabled) return { refreshed: false };
  await accessToken(sb, c, true);
  return { refreshed: true };
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
  const { data: a } = await (sb as any).from("parasut_auth").select("connected_at, user_email, expires_at, issuer, refresh_token, refresh_expires_at, last_error, offline, last_drop_error, last_drop_at").eq("id", 1).maybeSingle();
  const connected = !!(a?.connected_at && a?.refresh_token);
  return {
    enabled: c.enabled, hasApp: !!(c.clientId && c.clientSecret), hasNewApp: !!(c.v2ClientId && c.v2ClientSecret), companyId: c.companyId,
    connected, connectedAt: a?.connected_at ?? null, userEmail: a?.user_email ?? null,
    // Yeni altyapı mı (id.parasut.com)? Eski bağlantı 10 Aralık 2026'da kapanır → "yeniden bağlan" gerekir
    newAuth: connected && a?.issuer === "id", refreshExpiresAt: a?.refresh_expires_at ?? null, lastError: a?.last_error ?? null,
    offline: !!a?.offline || (a?.issuer === "id" && isOfflineToken({ refresh_token: a?.refresh_token })), lastDropError: a?.last_drop_error ?? null, lastDropAt: a?.last_drop_at ?? null,
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
  // full_path Paraşüt'te dizi olabilir (üst kategoriler); boş dizi "doğru" sayıldığı için ad boş görünüyordu → önce name
  const label = (a: any) => {
    const fp = Array.isArray(a?.full_path) ? a.full_path.map((x: any) => (typeof x === "string" ? x : x?.name)).filter(Boolean).join(" › ") : typeof a?.full_path === "string" ? a.full_path : "";
    return String(fp || a?.name || "").trim();
  };
  return rows.filter((r) => !r.attributes?.archived)
    .map((r) => ({ id: String(r.id), name: label(r.attributes) || `Kategori ${r.id}` }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
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
