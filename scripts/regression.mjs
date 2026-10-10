#!/usr/bin/env node
// REGRESYON PAKETİ — OTOMATİK KISIM. Her deploy'un SONUNDA kendiliğinden çalışır
// (scripts/deploy.sh); elle de çalıştırılabilir. ~1-2 dakika.
//   A) Duman kontrolleri (bu dosya): migration, sayfalar, yetki, veri güvenliği, tutarlılık, ayarlar,
//      arka plan işleri — yalnız okur (bot korumasını denemek için bot_blocks'a 1 kayıt düşer).
//   B) Fonksiyonel senaryolar (scripts/regression/NN-*.mjs): gerçek uçlarla uçtan uca iş akışı
//      (sipariş, kupon, stok, hediye, iptal/iade, silme...). Kendi test verisini kurar
//      (REGRESYON-TEST ürünleri, RGT kuponları, @yerihisset.test üyeleri — mağazada görünmez,
//      e-posta gitmez, yöneticiye bildirim düşmez) ve sonunda SİLER.
// Çıktı: geçen bölüm yalnız "PASS"; HATA / uyarı açıklamasıyla. Rehber + elle kısım: docs/REGRESYON-PAKETI.md
//
//   node scripts/regression.mjs           # geliştirme sonrası (test sitesi)
//   node scripts/regression.mjs --hizli   # yalnız A (fonksiyonel senaryolar atlanır)
//   node scripts/regression.mjs --canli   # canlıya geçiş kontrolü: e-posta kilidi kapalı, iyzico canlı,
//                                         # arama motoru engeli kalkmış olmalı (yoksa HATA)
//
// Ortam: .env.local'dan okur. APP_URL (varsayılan http://127.0.0.1:3000 — Caddy şifresi
// atlanır), DB_CONTAINER (varsayılan supabase-db).
import { readFileSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";

for (const name of [".env.local", ".env", ".env.production.local", ".env.production"]) {
  try {
    for (const line of readFileSync(new URL(`../${name}`, import.meta.url), "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* yoksa geç */ }
}

const APP = (process.env.APP_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const DB = process.env.DB_CONTAINER || "supabase-db";
const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const LIVE = process.argv.includes("--canli");
const QUICK = process.argv.includes("--hizli") || process.env.SKIP_FUNCTIONAL === "1";
const results = [];
let section = "";
// Geçenler sessiz; bölüm bitince tek satır: PASS ya da hata/uyarı sayısı + açıklamalar
const add = (status, name, detail = "") => { results.push({ section, status, name, detail }); };
const flush = () => {
  if (!section) return;
  const rs = results.filter((r) => r.section === section);
  const bad = rs.filter((r) => r.status !== "ok");
  if (!bad.length) { console.log(`▸ ${section}: PASS`); return; }
  const f = bad.filter((r) => r.status === "fail").length, w = bad.length - f;
  console.log(`▸ ${section}: ${f ? `${f} HATA` : ""}${f && w ? ", " : ""}${w ? `${w} uyarı` : ""}`);
  for (const r of bad) console.log(`    ${r.status === "fail" ? "✗" : "!"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
};
const head = (t) => { flush(); section = t; };
async function part(t, fn) {
  head(t);
  try { await fn(); } catch (e) { add("fail", "Bu bölüm kontrol edilemedi", String(e?.message || e).split(String.fromCharCode(10)).find((l) => l.trim()) || "bilinmeyen hata"); }
}
// Test sitesinde beklenen durum: normalde bilgi, --canli modunda HATA
const liveOnly = (okNow, name, detail) => add(okNow ? "ok" : LIVE ? "fail" : "ok", name, detail);

// ── Veritabanı (docker exec psql) ──
function sql(query) {
  const out = execFileSync("docker", ["exec", "-i", DB, "psql", "-U", "postgres", "-d", "postgres", "-qAt", "-F", "\t", "-v", "ON_ERROR_STOP=1"],
    { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  return out.split("\n").filter((l) => l.length).map((l) => l.split("\t"));
}
const one = (q) => (sql(q)[0] || [])[0];
// Ayar satırı JSON olarak (yeni/eksik sütun sorguyu çökertmesin)
let settingsCache = null;
const SETTINGS = () => settingsCache ??= JSON.parse(one("SELECT row_to_json(s) FROM public.settings s ORDER BY id LIMIT 1") || "{}");
const num = (q) => Number(one(q) || 0);
// SQL değişmezi (test modülleri veri kurarken)
const lit = (v) => v === null || v === undefined ? "NULL" : typeof v === "boolean" || typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;

// ── HTTP ──
async function get(path, opts = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(APP + path, { redirect: "manual", signal: AbortSignal.timeout(30000), ...opts });
    const text = await r.text();
    return { status: r.status, text, ms: Date.now() - t0 };
  } catch (e) {
    return { status: 0, text: String(e?.message || e), ms: Date.now() - t0 };
  }
}
const BROKEN = /Application error|Internal Server Error|Unhandled Runtime Error|NEXT_NOT_FOUND|digest:/i;
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
// Uygulama ucu (JSON). token → "Authorization: Bearer" (üye/yönetici oturumu)
async function api(path, { method = "POST", token, body, headers = {} } = {}) {
  const r = await get(path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { ...r, json: parse(r.text) };
}
// Supabase REST (PostgREST) — anon anahtar + kullanıcı oturumu: tarayıcının yaptığının aynısı (RLS geçerli)
async function rest(path, { token, method = "GET", body, headers = {} } = {}) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
      method, signal: AbortSignal.timeout(20000),
      headers: { apikey: ANON, Authorization: `Bearer ${token || ANON}`, "Content-Type": "application/json", ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await r.text();
    return { status: r.status, text, json: parse(text) };
  } catch (e) { return { status: 0, text: String(e?.message || e), json: null }; }
}
// Supabase Auth (GoTrue). service:true → yönetici anahtarıyla (test üyesi oluşturma)
async function auth(path, { method = "GET", body, service = false } = {}) {
  const key = service ? SERVICE : ANON;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/${path}`, {
      method, signal: AbortSignal.timeout(20000),
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await r.text();
    return { status: r.status, text, json: parse(text) };
  } catch (e) { return { status: 0, text: String(e?.message || e), json: null }; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`== REGRESYON${LIVE ? " (CANLIYA GEÇİŞ)" : ""} — ${new Date().toLocaleString("tr-TR")} ==`);

  // 1) Veritabanı güncellemeleri (migration) uygulanmış mı
  await part("Veritabanı güncellemeleri", async () => {
  const MIG = [
    ["20260926 ayar gizli kolonları", "SELECT NOT has_column_privilege('anon','public.settings','smtp_password','SELECT')"],
    ["20260927 güvenlik faz 1 (profiller)", "SELECT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_select_own_or_admin') AND NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Public profiles are viewable by everyone.')"],
    ["20260928 yedek kayıtları", "SELECT to_regclass('public.backup_runs') IS NOT NULL"],
    ["20260929 kupon görünürlüğü", "SELECT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='coupons' AND policyname='coupons_visible_read')"],
    ["20260930 güvenlik faz 4", "SELECT NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='settings' AND policyname='Public Read Settings')"],
    ["20261003 pazaryeri stok kuyruğu", "SELECT to_regclass('public.marketplace_stock_sync') IS NOT NULL"],
    ["20261004 senkron geçmişi", "SELECT to_regclass('public.marketplace_stock_log') IS NOT NULL"],
    ["20261005 pazaryeri siparişleri", "SELECT to_regclass('public.marketplace_order_sync') IS NOT NULL"],
    ["20261006 fiyat listeleri", "SELECT to_regclass('public.price_lists') IS NOT NULL"],
    ["20261007 pazaryeri fiyat kuyruğu", "SELECT to_regclass('public.marketplace_price_sync') IS NOT NULL"],
    ["20261008 test temizliği", "SELECT to_regprocedure('public.cleanup_test_data(boolean,text[],text[],boolean)') IS NOT NULL"],
    ["20261009 satış kanalları", "SELECT to_regclass('public.sales_channels') IS NOT NULL"],
    ["20261010 sunucu sağlığı", "SELECT to_regclass('public.server_health_runs') IS NOT NULL"],
    ["20261011 aktarım kara listesi", "SELECT to_regclass('public.legacy_import_blocklist') IS NOT NULL"],
    ["20261012 üye arama", "SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname='admin_search_members')"],
    ["20261013 eski üye silme", "SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname='admin_delete_legacy_members')"],
    ["20261014 profil ↔ hesap bağı", "SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND confrelid='auth.users'::regclass)"],
    ["20261015 otomatik rol/etiket", "SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname='refresh_member_auto_tags')"],
    ["20261016 Müşteri rolü (musteri)", "SELECT EXISTS(SELECT 1 FROM public.roles WHERE slug='musteri')"],
    ["20261017 Müdavim kuralı", "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='settings' AND column_name='mudavim_min_orders')"],
    ["20261018 pazaryeri ilanları", "SELECT to_regclass('public.marketplace_listings') IS NOT NULL"],
    ["20261020 iptal/iade akışı", "SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname='order_record_refund')"],
    ["20261021 kişi e-posta tekilliği", "SELECT to_regclass('public.contacts_email_unique') IS NOT NULL"],
    ["20261023 Amazon", "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='settings' AND column_name='amazon_enabled')"],
    ["20261024 bot koruması", "SELECT to_regclass('public.bot_blocks') IS NOT NULL"],
    ["20261025 iptal e-postası şablonu", "SELECT NOT EXISTS(SELECT 1 FROM public.email_templates WHERE trigger='order_cancelled' AND body_html LIKE '%Ödeme yapıldıysa%')"],
    ["20261026 şifresiz hesaplar", "SELECT to_regprocedure('public.mark_account_passwordless(uuid)') IS NOT NULL"],
    ["20261028 üyelik durumu (misafir/doğrulanmamış/üye)", "SELECT to_regprocedure('public.member_account_state(uuid)') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='on_profile_created_assign_role')"],
    ["20261101 varsayılan kargo yöntemi", "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='shipping_methods' AND column_name='is_default')"],
    ["20261031 satış sonrası (oldu/değişim/iade)", "SELECT to_regclass('public.order_cases') IS NOT NULL AND to_regprocedure('public.exchange_add_item(uuid,uuid,uuid)') IS NOT NULL"],
    ["20261030 sipariş sıradaki adım", "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='mp_restocked_at')"],
    ["20261029 kampanya e-postası izni", "SELECT to_regclass('public.marketing_consent_log') IS NOT NULL AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='marketing_consent')"],
    ["20261027 Meta reklamları", "SELECT to_regprocedure('public.strip_order_ad_meta()') IS NOT NULL AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='attribution')"],
  ];
  for (const [name, q] of MIG) {
    try { one(q) === "t" ? add("ok", name) : add("fail", name, "UYGULANMAMIŞ — migration dosyasını çalıştır"); }
    catch (e) { add("fail", name, `kontrol edilemedi: ${String(e.message).split("\n")[0]}`); }
  }

  // 2) Sayfalar (gerçek bağlantılar veritabanından)
  });
  await part("Sayfalar", async () => {
  const prod = sql("SELECT slug, title FROM public.products WHERE is_active AND category_id IS NOT NULL ORDER BY created_at DESC LIMIT 1")[0];
  const cat = one("SELECT c.slug FROM public.categories c WHERE EXISTS (SELECT 1 FROM public.products p WHERE p.category_id=c.id AND p.is_active) LIMIT 1");
  const brand = one("SELECT b.slug FROM public.brands b WHERE EXISTS (SELECT 1 FROM public.products p WHERE p.brand_id=b.id AND p.is_active) LIMIT 1");
  const kb = one("SELECT slug FROM public.kb_articles ORDER BY created_at DESC LIMIT 1");
  const pages = [
    ["/", "Ana sayfa"], ["/magaza", "Mağaza"],
    ...(prod ? [[`/products/${prod[0]}`, "Ürün sayfası", prod[1]]] : []),
    ...(cat ? [[`/kategori/${cat}`, "Kategori"]] : []), ...(brand ? [[`/marka/${brand}`, "Marka"]] : []),
    ["/ara?q=barefoot", "Arama"], ["/firsatlar", "Fırsatlar"], ["/bilgi-bankasi", "Bilgi bankası"],
    ...(kb ? [[`/bilgi-bankasi/${kb}`, "Bilgi bankası makalesi"]] : []),
    ["/barefoot-nedir", "Barefoot nedir"], ["/sepet", "Sepet"], ["/checkout", "Ödeme"], ["/siparis-tamam", "Sipariş sonucu"],
    ["/login", "Giriş"], ["/account", "Hesabım"], ["/sifre-belirle", "Şifre belirle"], ["/kampanya-izni", "Kampanya izni"], ["/deneme-sonucu", "Satış sonrası (oldu mu?)"], ["/iletisim", "İletişim"],
    ["/iade-degisim", "İade-değişim"], ["/mesafeli-satis", "Mesafeli satış"], ["/kvkk", "KVKK"], ["/gizlilik", "Gizlilik"],
    ["/cerez-politikasi", "Çerez politikası"], ["/admin", "Admin (kabuk)"], ["/sitemap.xml", "Site haritası"], ["/robots.txt", "robots.txt"],
  ];
  for (const [path, name, mustContain] of pages) {
    const r = await get(path);
    if (r.status !== 200) { add("fail", name, `HTTP ${r.status} (${path})`); continue; }
    if (BROKEN.test(r.text)) { add("fail", name, `sayfada hata metni (${path})`); continue; }
    if (mustContain && !r.text.includes(mustContain)) { add("fail", name, `"${mustContain}" sayfada yok`); continue; }
    add(r.ms > 3000 ? "warn" : "ok", name, r.ms > 3000 ? `yavaş açılıyor: ${r.ms} ms (${path})` : "");
  }
  const nf = await get("/bu-sayfa-kesinlikle-yok-123");
  nf.status === 404 ? add("ok", "Olmayan sayfa → 404") : add("warn", "Olmayan sayfa", `HTTP ${nf.status} (404 beklenirdi)`);
  if (prod) {
    const m = await get("/magaza");
    m.text.includes(`/products/${prod[0]}`) ? add("ok", "Mağazada ürün listeleniyor") : add("fail", "Mağazada ürün yok", `${prod[1]} görünmüyor`);
  }

  // 3) Uç noktalar ve yetki
  });
  await part("Uç noktalar ve yetki", async () => {
  const api = [
    ["Cron (pazaryeri) şifresiz → 401", "/api/cron/marketplace-sync", { method: "POST" }, 401],
    ["Cron (süresi dolan sipariş) şifresiz → 401", "/api/cron/expire-orders", { method: "POST" }, 401],
    ["Cron (sağlık) şifresiz → 401", "/api/cron/server-health", { method: "POST" }, 401],
    ["Admin ayarları girişsiz → 401", "/api/admin/settings", {}, 401],
    ["Admin sipariş silme girişsiz → 401", "/api/admin/orders/delete", { method: "POST", body: "{}" }, 401],
    ["Admin sipariş işlemi girişsiz → 401", "/api/admin/orders/action", { method: "POST", body: "{}" }, 401],
    ["Sipariş özeti geçersiz kimlik → 400", "/api/orders/summary?id=gecersiz", {}, 400],
    ["Bot koruması (bülten, formsuz) → 429", "/api/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "regresyon@example.com" }) }, 429],
  ];
  for (const [name, path, opts, want] of api) {
    const r = await get(path, opts);
    r.status === want ? add("ok", name) : add("fail", name, `HTTP ${r.status} (beklenen ${want})`);
  }
  const iyz = await get("/api/checkout/iyzico/initialize", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  iyz.status >= 500 && iyz.status !== 503 ? add("fail", "Kart ödeme başlatma", `HTTP ${iyz.status}`)
    : iyz.status === 503 ? liveOnly(false, "Kart ödeme kapalı", "iyzico anahtarları tanımlı değil")
    : add("ok", "Kart ödeme başlatma ucu yanıt veriyor", `HTTP ${iyz.status}`);

  // 4) Dışarıdan veri erişimi (anon anahtarla, Supabase üzerinden)
  });
  await part("Ürün beslemesi ve reklam etiketleri (Google / Meta)", async () => {
    const S = SETTINGS();
    const q = S.gmc_feed_secret ? `?secret=${encodeURIComponent(S.gmc_feed_secret)}` : "";
    const f = await get(`/feed/meta${q}`);
    if (f.status !== 200 || !f.text.includes("<rss")) { add("fail", "Meta katalog beslemesi açılmıyor", `HTTP ${f.status} (/feed/meta)`); return; }
    const g = await get(`/feed/google-merchant${q}`);
    g.status === 200 ? add("ok", "Google beslemesi") : add("fail", "Google beslemesi açılmıyor", `HTTP ${g.status}`);
    if (S.gmc_feed_secret) {
      const nos = await get("/feed/meta");
      nos.status === 401 ? add("ok", "Besleme gizli anahtarsız açılmıyor") : add("fail", "Besleme gizli anahtarsız açılıyor", `HTTP ${nos.status}`);
    }
    const items = f.text.split("<item>").slice(1);
    const want = num(`SELECT coalesce(sum(CASE WHEN p.has_variants AND n > 0 THEN n ELSE 1 END), 0) FROM public.products p
      CROSS JOIN LATERAL (SELECT count(*) AS n FROM public.product_variants v WHERE v.product_id = p.id AND v.is_active) c WHERE p.is_active`);
    items.length === want ? add("ok", "Beslemedeki ürün sayısı", `${want}`) : add("fail", "Besleme ürün sayısı tutmuyor", `beslemede ${items.length}, veritabanında ${want} aktif ürün/numara`);
    const noGroup = items.filter((i) => !i.includes("<g:item_group_id>")).length;
    noGroup ? add("fail", "Beslemede grup kimliği eksik", `${noGroup} ürün — Meta Pixel olaylarıyla eşleşmez`) : add("ok", "Tüm ürünlerde grup kimliği (Pixel eşleşmesi)");
    /<g:description>[^<]*<[a-z]/i.test(f.text) ? add("warn", "Besleme açıklamasında HTML kaldı") : add("ok", "Açıklamalar düz metin");
    const sized = num("SELECT count(*) FROM public.product_variants v JOIN public.products p ON p.id = v.product_id JOIN public.variant_options o ON o.id = v.variant_option_id JOIN public.variant_groups g ON g.id = o.group_id WHERE p.is_active AND v.is_active AND g.name ~* '(numara|beden)'");
    const sizeTags = (f.text.match(/<g:size>/g) || []).length;
    sized && sizeTags < sized ? add("fail", "Numara beslemeye 'size' olarak gitmiyor", `${sizeTags}/${sized}`) : add("ok", "Numaralar 'size' alanında", `${sizeTags}`);
    // Fiyat: örnek bir numaranın beslemedeki satış fiyatı = veritabanı fiyatı
    const v = sql("SELECT p.id, v.id, v.price, coalesce(v.compare_at_price, 0) FROM public.product_variants v JOIN public.products p ON p.id = v.product_id WHERE p.is_active AND p.has_variants AND v.is_active ORDER BY v.updated_at DESC NULLS LAST LIMIT 1")[0];
    if (v) {
      const it = items.find((i) => i.includes(`<g:id>${v[0]}_${v[1]}</g:id>`)) || "";
      const sale = Number(v[3]) > Number(v[2]);
      const shown = Number((it.match(sale ? /<g:sale_price>([\d.]+)/ : /<g:price>([\d.]+)/) || [])[1]);
      Math.abs(shown - Number(v[2])) < 0.01 ? add("ok", "Beslemedeki fiyat = sitedeki fiyat") : add("fail", "Beslemedeki fiyat sitedekiyle aynı değil", `beslemede ${shown}, veritabanında ${v[2]}`);
      const pg = await get(`/products/${one(`SELECT slug FROM public.products WHERE id = '${v[0]}'`)}?variant=${v[1]}`);
      pg.status === 200 ? add("ok", "Reklam bağlantısı (?variant=) ürün sayfasını açıyor") : add("fail", "Reklam bağlantısı açılmıyor", `HTTP ${pg.status}`);
    }
    const home = await get("/");
    /<script[^>]+connect\.facebook\.net/.test(home.text) ? add("fail", "Meta Pixel onaysız yükleniyor (KVKK)", "ana sayfa HTML'inde fbevents") : add("ok", "Meta Pixel onay olmadan yüklenmiyor");
    if (S.meta_domain_verification) {
      home.text.includes("facebook-domain-verification") ? add("ok", "Meta alan adı doğrulama etiketi") : add("fail", "Meta alan adı doğrulama etiketi sayfada yok", "Ayarlar › Meta");
    }
    if (S.meta_pixel_id && !S.meta_capi_token) add("warn", "Meta Conversions API anahtarı boş", "Pixel var ama sunucu bildirimi kapalı (iOS satışları eksik sayılır) → Ayarlar › Meta");
    liveOnly(!S.meta_test_event_code, "Meta test olay kodu dolu", "satışlar reklamlara SAYILMIYOR → Ayarlar › Meta › Test olay kodu'nu boşalt");
  });
  await part("Veri güvenliği (dışarıdan erişim)", async () => {
  if (!SB_URL || !ANON) add("warn", "Supabase anon kontrolleri", "NEXT_PUBLIC_SUPABASE_URL / ANON_KEY okunamadı");
  else {
    const rest = async (path, opts = {}) => {
      try {
        const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...opts, headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json", ...(opts.headers || {}) }, signal: AbortSignal.timeout(20000) });
        return { status: r.status, body: await r.text() };
      } catch (e) { return { status: 0, body: String(e) }; }
    };
    const p = await rest("profiles?select=email,phone&limit=5");
    // Ulaşılamıyorsa (HTTP 0) "açık" sanılmasın
    if (p.status === 0) { add("fail", "Supabase'e ulaşılamadı", `${SB_URL} — ${p.body.slice(0, 100)}`); return; }
    const rows = (() => { try { return JSON.parse(p.body); } catch { return null; } })();
    Array.isArray(rows) && rows.length > 0 ? add("fail", "Üye e-posta/telefonları dışarıya AÇIK", `anon anahtarla ${rows.length} kayıt okunabildi — güvenlik migration'ı (20260927) uygulanmamış`) : add("ok", "Üye e-posta/telefonları dışarıya kapalı");
    const s = await rest("settings?select=smtp_password&limit=1");
    s.status >= 400 ? add("ok", "Gizli ayarlar (SMTP şifresi) dışarıya kapalı") : add("fail", "Gizli ayarlar (SMTP şifresi) dışarıya AÇIK", `HTTP ${s.status} — 20260926 migration'ı uygulanmamış`);
    const capi = await rest("settings?select=meta_capi_token&limit=1");
    capi.status >= 400 ? add("ok", "Meta Conversions API anahtarı dışarıya kapalı") : add("fail", "Meta Conversions API anahtarı dışarıya AÇIK", `HTTP ${capi.status} — 20261027 migration'ı`);
    const px = await rest("settings?select=meta_pixel_id&limit=1");
    px.status === 200 ? add("ok", "Meta Pixel kimliği okunabiliyor") : add("fail", "Meta Pixel kimliği okunamıyor", `HTTP ${px.status} — Pixel yüklenemez (GRANT eksik, 20261027)`);
    const mcl = await rest("marketing_consent_log?select=email&limit=1");
    mcl.status >= 400 || (Array.isArray(mcl.json) && mcl.json.length === 0) ? add("ok", "Kampanya izin kayıtları dışarıya kapalı") : add("fail", "Kampanya izin kayıtları dışarıya AÇIK", `HTTP ${mcl.status}`);
    const o = await rest("orders?select=id&limit=1");
    const orows = (() => { try { return JSON.parse(o.body); } catch { return null; } })();
    Array.isArray(orows) && orows.length > 0 ? add("fail", "Siparişler dışarıya AÇIK", "anon sipariş okuyabiliyor") : add("ok", "Siparişler dışarıya kapalı");
    const ins = await rest("orders", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ total_amount: 1, status: "pending" }) });
    if (ins.status >= 400) add("ok", "Dışarıdan sahte sipariş eklenemiyor");
    else {
      add("fail", "Dışarıdan sipariş EKLENEBİLİYOR", "RLS açığı");
      try { const id = JSON.parse(ins.body)?.[0]?.id; if (id) sql(`DELETE FROM public.orders WHERE id='${id.replace(/[^0-9a-f-]/gi, "")}'`); } catch { /* */ }
    }
  }

  // 5) Veri tutarlılığı
  });
  await part("Veri tutarlılığı", async () => {
  const neg = num("SELECT count(*) FROM public.product_variants WHERE stock < 0") + num("SELECT count(*) FROM public.products WHERE stock < 0");
  neg ? add("fail", "Eksi stok", `${neg} ürün/numara`) : add("ok", "Eksi stok yok");
  const noCat = sql("SELECT title FROM public.products WHERE is_active AND category_id IS NULL ORDER BY title LIMIT 10").map((r) => r[0]);
  noCat.length ? add("warn", "Kategorisiz aktif ürün (mağazada görünmez)", noCat.join(", ")) : add("ok", "Tüm aktif ürünlerin kategorisi var");
  const noImg = sql("SELECT title FROM public.products WHERE is_active AND coalesce(image_url,'')='' AND coalesce(array_length(images,1),0)=0 ORDER BY title LIMIT 10").map((r) => r[0]);
  noImg.length ? add("warn", "Görselsiz aktif ürün", noImg.join(", ")) : add("ok", "Tüm aktif ürünlerin görseli var");
  const noSku = num("SELECT count(*) FROM public.product_variants v JOIN public.products p ON p.id=v.product_id WHERE p.is_active AND coalesce(v.is_active,true) AND coalesce(btrim(v.sku),'')=''");
  noSku ? add("warn", "SKU'su boş aktif numara", `${noSku} adet (pazaryeriyle eşleşmez)`) : add("ok", "Aktif numaraların SKU'su dolu");
  const impPw = num("SELECT count(*) FROM auth.users u JOIN public.profiles p ON p.id = u.id WHERE p.import_source IS NOT NULL AND u.last_sign_in_at IS NULL AND coalesce(u.encrypted_password, '') <> ''");
  impPw ? add("fail", "Aktarılan müşteri hesabı şifreli görünüyor", `${impPw} hesap — misafir siparişinde bilmediği şifreyle "giriş yapın" denir (20261026 migration'ı / woo-import)`) : add("ok", "Aktarılan müşteriler şifresiz (misafir olarak sipariş verebilir)");
  const uyeBad = num("SELECT count(*) FROM public.profiles p WHERE (public.member_account_state(p.id) = 'member') <> EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = p.id AND r.slug = 'uye')");
  uyeBad ? add("fail", "'Üye' rolü hesap durumuyla tutarsız", `${uyeBad} kişi — Üye rolü yalnız şifreli + e-postası doğrulanmış hesapta olmalı (20261028)`) : add("ok", "'Üye' rolü yalnız doğrulanmış hesaplarda");
  const empty = num("SELECT count(*) FROM public.orders o WHERE coalesce(o.channel,'site')='site' AND o.import_source IS NULL AND NOT EXISTS (SELECT 1 FROM public.order_items i WHERE i.order_id=o.id)");
  empty ? add("fail", "Ürünsüz site siparişi", `${empty} sipariş`) : add("ok", "Ürünsüz sipariş yok");
  const stale = num("SELECT count(*) FROM public.orders WHERE payment_status='pending' AND status <> 'cancelled' AND coalesce(channel,'site')='site' AND import_source IS NULL AND created_at < now() - interval '2 days'");
  stale ? add("warn", "2 günden eski ödenmemiş sipariş", `${stale} adet — süresi dolan sipariş iptali (cron) çalışıyor mu?`) : add("ok", "Süresi dolmuş ödenmemiş sipariş yok");
  const badSlug = num("SELECT count(*) FROM public.kb_articles WHERE slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'");
  badSlug ? add("warn", "Bilgi bankası adresi bozuk", `${badSlug} makale`) : add("ok", "Bilgi bankası adresleri düzgün");
  const shipping = num("SELECT count(*) FROM public.shipping_methods WHERE is_active");
  shipping ? add("ok", "Aktif kargo yöntemi var", `${shipping}`) : add("fail", "Aktif kargo yöntemi YOK", "ödeme yapılamaz");
  const defShip = sql("SELECT name, is_active FROM public.shipping_methods WHERE is_default");
  defShip.length === 1 && defShip[0][1] === "t" ? add("ok", "Varsayılan kargo yöntemi", defShip[0][0])
    : add("fail", "Varsayılan kargo yöntemi yok ya da pasif", "Ayarlar › Kargo Yöntemleri › Varsayılan yap");
  const mktFailed = num("SELECT count(*) FROM public.marketplace_stock_sync WHERE status='failed'");
  mktFailed ? add("warn", "Pazaryeri stok gönderim hatası", `${mktFailed} kayıt (Ayarlar › Entegrasyonlar)`) : add("ok", "Pazaryeri stok hatası yok");
  const qFailed = num("SELECT count(*) FROM public.email_queue WHERE status='failed' AND created_at > now() - interval '7 days'");
  qFailed ? add("warn", "Gönderilemeyen e-posta (son 7 gün)", `${qFailed}`) : add("ok", "E-posta kuyruğunda hata yok");

  // 6) Ayarlar ve ortam
  });
  await part("Ayarlar ve ortam", async () => {
  const S = SETTINGS();
  const st = {
    smtp: String(!!(S.smtp_host && S.smtp_user)),
    contact: S.contact_email || "",
    notify: S.admin_notify_email || "",
    bank: String(!S.bank_transfer_enabled || !!String(S.bank_transfer_info || "").trim()),
    ga: S.ga_measurement_id || "",
    lock: String(S.email_lock_enabled !== false),
  };
  st.smtp === "true" ? add("ok", "E-posta (SMTP) ayarlı") : add("fail", "E-posta (SMTP) ayarlı değil");
  // Yönetici bildirimleri (yeni sipariş, stok bitti…) iletişim e-postasına gider (ayrı alan yok)
  st.contact || st.notify ? add("ok", "İletişim / bildirim e-postası", st.notify || st.contact)
    : add("fail", "İletişim e-postası boş", "yönetici bildirimleri gidecek adres yok → Ayarlar › Genel");
  st.bank === "true" ? add("ok", "Havale bilgisi") : add("fail", "Havale açık ama banka bilgisi boş");
  st.ga ? add("ok", "Google Analytics kimliği", st.ga) : add("warn", "Google Analytics kimliği boş");
  liveOnly(st.lock !== "true", "E-posta kilidi açık", "canlıda müşterilere e-posta gitmez → Ayarlar › Genel › E-posta Kilidi'ni kapat");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  /^https:\/\//.test(siteUrl) ? add("ok", "Site adresi") : add("fail", "Site adresi (NEXT_PUBLIC_SITE_URL) ayarlı değil / https değil", siteUrl || "boş");
  liveOnly(!/dev\./.test(siteUrl), "Site adresi test sitesini gösteriyor", `${siteUrl} → canlı adres olmalı (iyzico dönüşü, e-posta bağlantıları)`);
  process.env.CRON_SECRET ? add("ok", "CRON_SECRET tanımlı") : add("fail", "CRON_SECRET yok");
  // Bakım sayfası: deploy sırasında / çökmede Caddy maintenance/index.html gösterir (docs/BAKIM-SAYFASI.md)
  let caddy = null;
  try { caddy = readFileSync("/etc/caddy/Caddyfile", "utf8"); } catch { /* okunamıyor (yetki / yerel) */ }
  if (caddy !== null) {
    /maintenance/.test(caddy) && /handle_errors/.test(caddy)
      ? add("ok", "Bakım sayfası Caddy'de tanımlı")
      : add("warn", "Bakım sayfası Caddy'de tanımlı değil", "deploy sırasında ziyaretçi hata görür → docs/BAKIM-SAYFASI.md");
  }
  liveOnly(!!process.env.IYZICO_API_KEY, "iyzico anahtarı yok", "kartla ödeme kapalı");
  liveOnly(!/sandbox/i.test(process.env.IYZICO_BASE_URL || "sandbox"), "iyzico TEST (sandbox) modunda", "IYZICO_BASE_URL=https://api.iyzipay.com + canlı anahtarlar");
  liveOnly(process.env.NEXT_PUBLIC_NOINDEX !== "true", "Arama motoru engeli açık (NEXT_PUBLIC_NOINDEX=true)", "canlıda kaldır, yoksa Google siteyi listelemez");
  const admins = sql("SELECT email FROM public.profiles WHERE role='admin' ORDER BY email").map((r) => r[0]);
  admins.length && admins.length <= 3 ? add("ok", "Yönetici hesapları") : add("warn", "Yönetici hesabı sayısı", `${admins.length}: ${admins.join(", ")} — gereksiz yönetici var mı?`);

  // 7) Arka plan işleri
  });
  await part("Arka plan işleri", async () => {
  const backupH = Number(one("SELECT extract(epoch FROM now()-max(created_at))/3600 FROM public.backup_runs WHERE kind='backup' AND ok") || 999);
  backupH < 26 ? add("ok", "Gece yedeği", `${backupH.toFixed(1)} saat önce`) : add("fail", "Gece yedeği", backupH >= 999 ? "hiç başarılı yedek yok" : `${backupH.toFixed(0)} saat önce`);
  const healthM = Number(one("SELECT extract(epoch FROM now()-max(created_at))/60 FROM public.server_health_runs") || 9999);
  healthM < 40 ? add("ok", "Sunucu sağlık kontrolü", `${healthM.toFixed(0)} dk önce`) : add("warn", "Sunucu sağlık kontrolü", healthM >= 9999 ? "hiç çalışmadı" : `${healthM.toFixed(0)} dk önce`);
  const hstat = one("SELECT status FROM public.server_health_runs ORDER BY created_at DESC LIMIT 1");
  hstat === "fail" ? add("fail", "Sunucu sağlığı", "kırmızı — dashboard kartına bak") : hstat === "warn" ? add("warn", "Sunucu sağlığı", "sarı — dashboard kartına bak") : add("ok", "Sunucu sağlığı", hstat || "—");
  const S = SETTINGS();
  const mktOn = !!(S.trendyol_enabled || S.hepsiburada_enabled || S.amazon_enabled);
  const beatM = Number(one("SELECT extract(epoch FROM now()-last_run_at)/60 FROM public.cron_heartbeats WHERE name='marketplace-sync'") || 9999);
  if (mktOn) beatM < 10 ? add("ok", "Pazaryeri senkronu", `${beatM.toFixed(0)} dk önce`) : add("fail", "Pazaryeri senkronu durmuş", `${beatM >= 9999 ? "hiç" : beatM.toFixed(0) + " dk önce"}`);
  else add("ok", "Pazaryeri senkronu", "pazaryerleri kapalı");
  });

  // 8) Fonksiyonel senaryolar — scripts/regression/NN-*.mjs (numara sırasıyla). Her modül:
  //    export default { name, async run(t) { await t.part("Bölüm", async () => { ... t.add(...) }) } }
  //    Yeni geliştirme → ilgili modüle senaryo ya da yeni modül (kural: docs/REGRESYON-PAKETI.md).
  if (QUICK) {
    head("Fonksiyonel senaryolar"); add("ok", "atlandı (--hizli)");
  } else if (!SB_URL || !ANON || !SERVICE) {
    head("Fonksiyonel senaryolar"); add("fail", "Çalıştırılamadı", "NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SUPABASE_SERVICE_ROLE_KEY okunamadı");
  } else {
    const dir = fileURLToPath(new URL("./regression/", import.meta.url));
    let files = [];
    try { files = readdirSync(dir).filter((f) => /^\d+-.*\.mjs$/.test(f)).sort(); } catch { /* klasör yok */ }
    const t = { APP, SB_URL, LIVE, sql, one, num, lit, add, part, api, rest, auth, sleep };
    for (const f of files) {
      let mod;
      try { mod = (await import(pathToFileURL(dir + f).href)).default; }
      catch (e) { head(`Senaryo dosyası ${f}`); add("fail", "Yüklenemedi", String(e?.message || e).split("\n")[0]); continue; }
      try { await mod.run(t); }
      catch (e) { head(`${mod?.name || f}`); add("fail", "Senaryo yarıda kaldı", String(e?.message || e).split("\n")[0]); }
    }
  }

  flush();
  // Özet
  const f = results.filter((r) => r.status === "fail"), w = results.filter((r) => r.status === "warn");
  console.log(`\n== SONUÇ: ${f.length ? `✗ ${f.length} HATA` : "✓ PASS"}${w.length ? ` · ${w.length} uyarı` : ""} (${results.length} kontrol) ==`);
  if (f.length) console.log("HATA var → bu çıktıyı Claude'a ilet.");

  try {
    const dir = new URL("../.regression-report/", import.meta.url);
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    writeFileSync(new URL(`regresyon-${stamp}.txt`, dir), results.map((r) => `${r.status.toUpperCase()}\t${r.section}\t${r.name}\t${r.detail}`).join("\n") + "\n");
  } catch { /* rapor yazılamazsa önemli değil */ }
  process.exit(f.length ? 1 : 0);
}

main().catch((e) => { console.error("\nHATA:", e?.message || e); process.exit(2); });
