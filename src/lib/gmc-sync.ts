/* eslint-disable @typescript-eslint/no-explicit-any */
// GOOGLE MERCHANT API (v1) — anlık ürün gönderimi. Content API 18.08.2026'da kapandı; yerine Merchant API.
//   Kimlik: servis hesabı (JSON anahtar, Ayarlar › Entegrasyonlar › Google Merchant'a yapıştırılır) → JWT (RS256)
//   → 1 saatlik erişim anahtarı, kapsam https://www.googleapis.com/auth/content.
//   Bir kez: "Google'a kaydol" (developerRegistration:registerGcp) + veri kaynağı seçimi (beslemenin kaynağı).
//   Gönderim: productInputs:insert / delete, beslemeyle AYNI veri kaynağı ve kimlik (src/lib/gmc-items.ts) →
//   günlük besleme çekimi tam eşitleme yapar, API değişeni dakikalar içinde yazar; çift ürün oluşmaz.
//   Kuyruk: gmc_sync_queue (ürün / numara tetikleyicisi, migration 20261122) → cron dakikada bir processGmcQueue.

import { createSign, createHash } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase-admin";
import { buildGmcItems, gmcSettings, type GmcItem } from "@/lib/gmc-items";
type Sb = ReturnType<typeof createAdminClient>;

const API = "https://merchantapi.googleapis.com";
const SCOPE = "https://www.googleapis.com/auth/content";

export class GmcError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function gmcConfig(sb: Sb) {
  const s = await gmcSettings(sb);
  let sa: { client_email?: string; private_key?: string; project_id?: string } = {};
  try { sa = s.gmc_service_account ? JSON.parse(s.gmc_service_account) : {}; } catch { /* geçersiz JSON */ }
  return {
    enabled: !!s.gmc_api_enabled,
    merchantId: String(s.gmc_merchant_id || "").replace(/\D/g, ""),
    dataSource: String(s.gmc_data_source || ""),
    contentLanguage: String(s.gmc_content_language || "tr"),
    feedLabel: String(s.gmc_feed_label || "TR"),
    clientEmail: sa.client_email || "",
    privateKey: sa.private_key || "",
    projectId: sa.project_id || "",
    settings: s,
  };
}
type Cfg = Awaited<ReturnType<typeof gmcConfig>>;

// ── Erişim anahtarı (servis hesabı JWT) ─────────────────────────────────────
let tokenCache: { key: string; token: string; exp: number } | null = null;
const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

async function accessToken(c: Cfg): Promise<string> {
  if (!c.clientEmail || !c.privateKey) throw new GmcError(400, "Servis hesabı anahtarı (JSON) girilmemiş ya da geçersiz.");
  if (tokenCache && tokenCache.key === c.clientEmail && tokenCache.exp > Date.now() + 5 * 60_000) return tokenCache.token;
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64u(JSON.stringify({
    iss: c.clientEmail, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }))}`;
  let sig: string;
  try { sig = b64u(createSign("RSA-SHA256").update(unsigned).sign(c.privateKey)); }
  catch { throw new GmcError(400, "Servis hesabı anahtarı okunamadı (JSON'daki private_key)."); }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }).toString(),
    signal: AbortSignal.timeout(20000), cache: "no-store",
  }).catch((e) => { throw new GmcError(0, `Google'a bağlanılamadı: ${e?.message || e}`); });
  const j: any = await res.json().catch(() => null);
  if (!res.ok || !j?.access_token) throw new GmcError(401, `Google oturumu alınamadı: ${j?.error_description || j?.error || res.status}`);
  tokenCache = { key: c.clientEmail, token: j.access_token, exp: Date.now() + Number(j.expires_in || 3600) * 1000 };
  return j.access_token;
}

async function call(c: Cfg, method: string, path: string, body?: unknown) {
  const token = await accessToken(c);
  let res: Response;
  try {
    res = await fetch(API + path, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000), cache: "no-store",
    });
  } catch (e: any) { throw new GmcError(0, `Google'a bağlanılamadı: ${e?.message || e}`); }
  const text = await res.text();
  let j: any = null;
  try { j = text ? JSON.parse(text) : null; } catch { /* düz metin */ }
  if (!res.ok) {
    const msg = j?.error?.message || text?.slice(0, 300) || res.statusText;
    const hint = /not registered|GCP project/i.test(msg) ? " (Ayarlar › Google Merchant › “Google'a kaydol”)" : res.status === 403 ? " (servis hesabı Merchant Center'a yönetici olarak eklenmiş mi?)" : "";
    throw new GmcError(res.status, `Google ${res.status}: ${msg}${hint}`);
  }
  return j;
}

// ── Kurulum ─────────────────────────────────────────────────────────────────

/** Bir kez: Google Cloud projesini Merchant Center hesabına kaydet */
export async function registerGcp(sb: Sb, developerEmail?: string) {
  const c = await gmcConfig(sb);
  if (!c.merchantId) throw new GmcError(400, "Merchant Center hesap numarası girilmemiş.");
  return call(c, "POST", `/accounts/v1/accounts/${c.merchantId}/developerRegistration:registerGcp`, developerEmail ? { developerEmail } : {});
}

/** Veri kaynakları (beslemenin kaynağını seçmek için) */
export async function listDataSources(sb: Sb) {
  const c = await gmcConfig(sb);
  if (!c.merchantId) throw new GmcError(400, "Merchant Center hesap numarası girilmemiş.");
  const j = await call(c, "GET", `/datasources/v1/accounts/${c.merchantId}/dataSources?pageSize=100`);
  return ((j?.dataSources as any[]) || []).filter((d) => d.primaryProductDataSource).map((d) => ({
    name: String(d.name), displayName: String(d.displayName || d.dataSourceId), input: d.input || null,
    contentLanguage: d.primaryProductDataSource?.contentLanguage || null, feedLabel: d.primaryProductDataSource?.feedLabel || null,
  }));
}

// ── Kalem → Merchant API ────────────────────────────────────────────────────

const micros = (n: number) => String(Math.round(n * 1_000_000));
const ENUM = (v: string | null) => (v ? v.toUpperCase() : undefined);

export function toProductAttributes(it: GmcItem) {
  const color = it.variantTag === "color" ? it.variantValue : it.color;
  const a: Record<string, unknown> = {
    title: it.title.slice(0, 150), description: it.description, link: it.link,
    ...(it.imageLink ? { imageLink: it.imageLink } : {}),
    ...(it.additionalImageLinks.length ? { additionalImageLinks: it.additionalImageLinks.slice(0, 10) } : {}),
    availability: it.availability === "in_stock" ? "IN_STOCK" : "OUT_OF_STOCK",
    condition: ENUM(it.condition) || "NEW",
    price: { amountMicros: micros(it.price), currencyCode: it.currency },
    ...(it.salePrice != null ? { salePrice: { amountMicros: micros(it.salePrice), currencyCode: it.currency } } : {}),
    brand: it.brand, itemGroupId: it.itemGroupId,
    ...(it.gtin ? { gtins: [it.gtin] } : {}), ...(it.mpn ? { mpn: it.mpn } : {}),
    identifierExists: it.identifierExists,
    ...(it.productType ? { productTypes: [it.productType], customLabel0: it.productType } : {}),
    ...(it.googleProductCategory ? { googleProductCategory: it.googleProductCategory } : {}),
    ...(it.variantTag === "size" && it.variantValue ? { size: it.variantValue } : {}),
    ...(it.sizeSystem ? { sizeSystem: it.sizeSystem } : {}),
    ...(color ? { color } : {}),
    ...(it.gender ? { gender: ENUM(it.gender) } : {}), ...(it.ageGroup ? { ageGroup: ENUM(it.ageGroup) } : {}),
    ...(it.material ? { material: it.material } : {}),
    ...(it.highlights.length ? { productHighlights: it.highlights } : {}),
    ...(it.details.length ? { productDetails: it.details.map(([k, v]) => ({ sectionName: "Teknik bilgiler", attributeName: k, attributeValue: v })) } : {}),
  };
  return a;
}

// ── Kuyruk ──────────────────────────────────────────────────────────────────

export async function processGmcQueue(sb: Sb, limit = 30) {
  const s = sb as any;
  const c = await gmcConfig(sb);
  const rep = { products: 0, sent: 0, deleted: 0, failed: 0, skipped: "" as string, errors: [] as string[] };
  if (!c.enabled) return { ...rep, skipped: "disabled" };
  if (!c.merchantId || !c.dataSource || !c.clientEmail) return { ...rep, skipped: "not_configured" };

  const { data: q } = await s.from("gmc_sync_queue").select("product_id, attempts").lte("next_attempt_at", new Date().toISOString())
    .order("queued_at").limit(limit);
  const rows = (q as any[]) || [];
  if (!rows.length) return rep;
  const ids = rows.map((r) => r.product_id);
  const items = await buildGmcItems(sb, { productIds: ids, settings: c.settings });
  const { data: prev } = await s.from("gmc_offers").select("offer_id, product_id, hash").in("product_id", ids);
  const ds = `dataSource=${encodeURIComponent(c.dataSource)}`;

  for (const r of rows) {
    rep.products++;
    const mine = items.filter((it) => it.itemGroupId === r.product_id);
    const old = ((prev as any[]) || []).filter((p) => p.product_id === r.product_id);
    let err: string | null = null;
    try {
      for (const it of mine) {
        const body = { offerId: it.id, contentLanguage: c.contentLanguage, feedLabel: c.feedLabel, productAttributes: toProductAttributes(it) };
        const hash = createHash("sha1").update(JSON.stringify(body)).digest("hex");
        if (old.find((o) => o.offer_id === it.id)?.hash === hash) continue; // değişmedi
        try {
          await call(c, "POST", `/products/v1/accounts/${c.merchantId}/productInputs:insert?${ds}`, body);
          await s.from("gmc_offers").upsert({ offer_id: it.id, product_id: r.product_id, hash, sent_at: new Date().toISOString(), ok: true, error: null });
          rep.sent++;
        } catch (e: any) {
          if (e instanceof GmcError && [0, 401, 429].includes(e.status)) throw e; // tüm tur dursun, sonra tekrar
          await s.from("gmc_offers").upsert({ offer_id: it.id, product_id: r.product_id, hash: null, sent_at: new Date().toISOString(), ok: false, error: e?.message || String(e) });
          rep.failed++; rep.errors.push(`${it.id}: ${e?.message || e}`);
        }
      }
      // Artık beslemede olmayan (pasif / silinmiş) kalemler → Google'dan sil
      for (const o of old.filter((o) => !mine.some((it) => it.id === o.offer_id))) {
        const name = `${c.contentLanguage}~${c.feedLabel}~${o.offer_id}`;
        try { await call(c, "DELETE", `/products/v1/accounts/${c.merchantId}/productInputs/${encodeURIComponent(name)}?${ds}`); }
        catch (e: any) { if (!(e instanceof GmcError && e.status === 404)) throw e; }
        await s.from("gmc_offers").delete().eq("offer_id", o.offer_id);
        rep.deleted++;
      }
    } catch (e: any) {
      err = e?.message || String(e);
      rep.errors.push(err!);
    }
    if (err) {
      const a = Number(r.attempts || 0) + 1;
      await s.from("gmc_sync_queue").update({ attempts: a, error: err, next_attempt_at: new Date(Date.now() + Math.min(60, 2 ** a) * 60_000).toISOString() }).eq("product_id", r.product_id);
      if (/Google (0|401|429)/.test(err) || err.includes("bağlanılamadı")) break;
    } else {
      await s.from("gmc_sync_queue").delete().eq("product_id", r.product_id);
    }
  }
  return rep;
}

/** Ayarlar kartı: durum özeti */
export async function gmcStatus(sb: Sb) {
  const s = sb as any;
  const c = await gmcConfig(sb);
  const [{ count: queued }, { count: ok }, { data: bad }] = await Promise.all([
    s.from("gmc_sync_queue").select("product_id", { count: "exact", head: true }),
    s.from("gmc_offers").select("offer_id", { count: "exact", head: true }).eq("ok", true),
    s.from("gmc_offers").select("offer_id, error, sent_at").eq("ok", false).order("sent_at", { ascending: false }).limit(10),
  ]);
  return {
    enabled: c.enabled, merchantId: c.merchantId, dataSource: c.dataSource, contentLanguage: c.contentLanguage, feedLabel: c.feedLabel,
    serviceAccount: c.clientEmail || null, projectId: c.projectId || null, keyOk: !!(c.clientEmail && c.privateKey),
    queued: queued ?? 0, sentOk: ok ?? 0, errors: (bad as any[]) || [],
  };
}
