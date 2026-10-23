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
    // "fetch failed" = bağlantı kurulamadı / koptu (yanıt yok; ör. kapanmış bağlantının yeniden kullanımı) → bir kez daha dene
    if (!opts._retried && String(e?.message || e) === "fetch failed") {
      await new Promise((res) => setTimeout(res, 1000));
      return get(path, { ...opts, _retried: true });
    }
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
    ["20261120 Paraşüt fatura (tahsilat işareti, kargo kalemi, kapalı PDF deposu)", "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'parasut_paid') AND EXISTS(SELECT 1 FROM storage.buckets WHERE id = 'invoices' AND NOT public)"],
    ["20261127 mağaza segmentleri (Yetişkin / 0–4 Yaş İlkadım)", "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'segment')"],
    ["20261128 aynı barkod iki kez kaydedilemez", "SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'trg_variant_barcode_unique')"],
    ["20261129 aynı SKU iki kez kaydedilemez", "SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'trg_variant_sku_unique')"],
    ["20261130 barkod / SKU ön kontrolü", "SELECT to_regprocedure('public.variant_code_conflicts(uuid, text[], text[])') IS NOT NULL"],
    ["20261131 iptalde fatura gerekmiyor", "SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'trg_order_cancel_invoice_status')"],
    ["20261132 Paraşüt fatura kategorisi (kanala göre)", "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'parasut_channel_settings' AND column_name = 'category_id')"],
    ["20261133 iade gelecek (müşteri kendisi gönderiyor)", "SELECT pg_get_constraintdef(oid) LIKE '%self%' FROM pg_constraint WHERE conname = 'order_cases_return_method_check'"],
    ["20261134 iade talebinde fatura gerekmiyor", "SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'trg_order_case_invoice_rule')"],
    ["20261135 faturayı Trendyol'a yükleme", "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'mp_invoice_sent_at')"],
    ["20261136 Hepsiburada paket numarası (fatura bağlantısı)", "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'mp_package_number')"],
    ["20261138 kart ödemesi aç / kapa", "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'card_payment_enabled')"],
    ["20261137 Trendyol sipariş saati (GMT+3)", "SELECT NOT EXISTS(SELECT 1 FROM public.orders WHERE channel = 'trendyol' AND import_source IS NULL AND coalesce(external_raw->>'orderDate', '') ~ '^[0-9]{10,13}$' AND abs(extract(epoch FROM created_at - (to_timestamp((external_raw->>'orderDate')::bigint / 1000.0) - interval '3 hours'))) > 60)"],
    ["20261126 ödeme alınmadan sevkiyat başlamaz", "SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guard_ship_before_payment')"],
    ["20261125 marka hakkında (bütün ürün sayfalarında)", "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'about')"],
    ["20261124 yorum isteme + seni özledik (ayarlar, şablonlar, geri dönüş tetikleyicisi)", "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'order_reviews' AND column_name = 'answers') AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'trg_detect_winback') AND (SELECT count(*) FROM public.email_templates WHERE trigger IN ('review_request', 'winback')) = 2"],
    ["20261123 üye listesi durum / sipariş süzgeci + silme", "SELECT to_regprocedure('public.admin_search_members(text, uuid, uuid, text, int, int, text, text)') IS NOT NULL AND to_regprocedure('public.admin_delete_members(uuid[])') IS NOT NULL"],
    ["20261122 Google Merchant API (kuyruk + ürün / numara tetikleyicisi)", "SELECT to_regclass('public.gmc_sync_queue') IS NOT NULL AND to_regclass('public.gmc_offers') IS NOT NULL AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gmc_variant') AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gmc_product')"],
    ["20261121 fatura PDF deposunda boyut sınırı (10 MB, yalnız PDF)", "SELECT EXISTS(SELECT 1 FROM storage.buckets WHERE id = 'invoices' AND file_size_limit IS NOT NULL AND allowed_mime_types = ARRAY['application/pdf'])"],
    ["20261119 Paraşüt bağlantı / kanal / kargo VKN / ürün eşleştirme", "SELECT to_regclass('public.parasut_auth') IS NOT NULL AND to_regclass('public.parasut_channel_settings') IS NOT NULL AND to_regclass('public.cargo_carriers') IS NOT NULL AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'product_variants' AND column_name = 'parasut_product_id')"],
    ["20261118 Kargonomi teklif / firma seçimi / kod bekleme alanları", "SELECT count(*) = 3 FROM information_schema.columns WHERE table_name = 'orders' AND column_name IN ('kargonomi_offers', 'kargonomi_confirmed_at', 'kargonomi_error')"],
    ["20261117 Amazon fiyat listesi", "SELECT EXISTS(SELECT 1 FROM public.price_lists WHERE code = 'amazon_sale' AND channel = 'amazon')"],
    ["20261116 iade işlenen kapalı siparişler yeniden açık", "SELECT NOT EXISTS(SELECT 1 FROM public.orders WHERE is_closed AND payment_status IN ('refunded','partial_refund') AND invoice_status = 'invoiced')"],
    ["20261115 iade yöntemi: kredi kartı (elle)", "SELECT public.refund_method_label('card') = 'Kredi kartı'"],
    ["20261114 kategori / marka sayfa metni (tanıtım + SSS)", "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='categories' AND column_name='faq') AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='brands' AND column_name='intro')"],
    ["20261113 kişi kampanya izni + TC kimlik saklanmıyor", "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='contacts' AND column_name='marketing_consent') AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE identity_number IS NOT NULL)"],
    ["20261112 ana sayfa metinleri panelden", "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='settings' AND column_name='home_content')"],
    ["20261111 ürün kodu ayrı alanda (model_code)", "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='model_code')"],
    ["20261110 düzenlenebilir sayfalar + şirket künyesi", "SELECT to_regclass('public.static_pages') IS NOT NULL AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='settings' AND column_name='company_title')"],
    ["20261109 çerez onayı (mod ayarı, onay defteri, kimliksiz sayaç)", "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='settings' AND column_name='cookie_consent_strict') AND to_regclass('public.consent_log') IS NOT NULL AND to_regclass('public.analytics_anon_daily') IS NOT NULL AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='analytics_sessions' AND column_name='consent')"],
    ["20261108 pazaryeri yardımcı fonksiyonları dışarıya kapalı", "SELECT NOT has_function_privilege('anon', 'public.marketplace_is_listed(text,text)', 'EXECUTE') AND NOT has_function_privilege('authenticated', 'public.marketplace_send_qty(text,uuid,integer)', 'EXECUTE')"],
    ["20261107 yetkili fonksiyonlar dışarıya kapalı", "SELECT NOT has_function_privilege('anon', 'public.link_contacts_for_user(uuid,text)', 'EXECUTE') AND NOT has_function_privilege('authenticated', 'public.link_contacts_for_user(uuid,text)', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.rollup_analytics_daily(date)', 'EXECUTE')"],
    ["20261106 e-posta sağlığı, sonuçsuz arama silme, entegre kanala görev yok", "SELECT to_regclass('public.mail_health') IS NOT NULL AND to_regclass('public.search_dismissals') IS NOT NULL AND to_regprocedure('public.no_result_searches(integer)') IS NOT NULL AND pg_get_functiondef('public.create_stock_sync_tasks()'::regprocedure) LIKE '%integration = ''manual''%'"],
    ["20261105 sistem durumu (müşteri hataları, yönetici girişleri)", "SELECT to_regclass('public.client_errors') IS NOT NULL AND to_regprocedure('public.admin_login_activity(integer)') IS NOT NULL"],
    ["20261104 video kovası (media)", "SELECT EXISTS(SELECT 1 FROM storage.buckets WHERE id='media' AND public)"],
    ["20261103 mobil karşılama videosu", "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='settings' AND column_name='intro_video_url')"],
    ["20261102 ölçü tabloları", "SELECT to_regclass('public.size_charts') IS NOT NULL"],
    ["20261102b Attipas numaraları", "SELECT NOT EXISTS(SELECT 1 FROM public.size_charts s JOIN public.brands b ON b.id = s.brand_id WHERE lower(b.name) LIKE 'attipas%' AND s.rows->0->>'label' = 'S')"],
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
  const prod = sql("SELECT p.slug, p.title, c.segment FROM public.products p JOIN public.categories c ON c.id = p.category_id WHERE p.is_active ORDER BY p.created_at DESC LIMIT 1")[0];
  // Yetişkin kategorisi (İlkadım'ın tek kategorisi /magaza/ilkadim'e yönlenir)
  const cat = one("SELECT c.slug FROM public.categories c WHERE c.segment = 'yetiskin' AND EXISTS (SELECT 1 FROM public.products p WHERE p.category_id=c.id AND p.is_active) LIMIT 1");
  const brand = one("SELECT b.slug FROM public.brands b WHERE EXISTS (SELECT 1 FROM public.products p WHERE p.brand_id=b.id AND p.is_active) LIMIT 1");
  const kb = one("SELECT slug FROM public.kb_articles ORDER BY created_at DESC LIMIT 1");
  const pages = [
    ["/", "Ana sayfa"], ["/magaza", "Mağaza"],
    ...(prod ? [[`/products/${prod[0]}`, "Ürün sayfası", prod[1]]] : []),
    ...(cat ? [[`/kategori/${cat}`, "Kategori"]] : []), ...(brand ? [[`/marka/${brand}`, "Marka"]] : []),
    ["/ara?q=barefoot", "Arama"], ["/firsatlar", "Fırsatlar"], ["/bilgi-bankasi", "Bilgi bankası"],
    ...(kb ? [[`/bilgi-bankasi/${kb}`, "Bilgi bankası makalesi"]] : []),
    ["/barefoot-nedir", "Barefoot nedir (ana rehber)", "Zero drop"], ["/magaza", "Mağaza başlığı (H1)", "Barefoot Ayakkabı Mağazası"],
    ["/magaza/yetiskin", "Yetişkin mağazası", "Yetişkin Barefoot Ayakkabı"], ["/magaza/ilkadim", "0–4 Yaş İlkadım mağazası", "0–4 Yaş İlkadım"], ["/sepet", "Sepet"], ["/checkout", "Ödeme"], ["/siparis-tamam", "Sipariş sonucu"],
    ["/login", "Giriş"], ["/account", "Hesabım"], ["/sifre-belirle", "Şifre belirle"], ["/kampanya-izni", "Kampanya izni"], ["/deneme-sonucu", "Satış sonrası (oldu mu?)"], ["/iletisim", "İletişim", "Kromozom"], ["/hakkimizda", "Hakkımızda", "Kromozom"],
    ["/iade-degisim", "İade-değişim", "gün evde deneyin"], ["/mesafeli-satis", "Mesafeli satış + ön bilgilendirme", "on-bilgilendirme"], ["/kvkk", "KVKK", "Kromozom"], ["/gizlilik", "Gizlilik"],
    ["/cerez-politikasi", "Çerez politikası (tercih değiştirme)", "Çerez tercihlerini değiştir"], ["/admin", "Admin (kabuk)"], ["/admin/system", "Admin sistem (kabuk)"], ["/sitemap.xml", "Site haritası"], ["/robots.txt", "robots.txt"],
  ];
  for (const [path, name, mustContain] of pages) {
    const r = await get(path);
    if (r.status !== 200) { add("fail", name, `HTTP ${r.status} (${path})`); continue; }
    if (BROKEN.test(r.text)) { add("fail", name, `sayfada hata metni (${path})`); continue; }
    if (mustContain && !r.text.includes(mustContain)) { add("fail", name, `"${mustContain}" sayfada yok`); continue; }
    add(r.ms > 3000 ? "warn" : "ok", name, r.ms > 3000 ? `yavaş açılıyor: ${r.ms} ms (${path})` : "");
  }
  // Hukuki metinler canlıda taslak kalmamalı (docs/HUKUKI-METINLER-NOTLAR.md); künyede boş alan olmamalı
  for (const path of ["/kvkk", "/gizlilik", "/cerez-politikasi", "/mesafeli-satis", "/iade-degisim", "/hakkimizda", "/iletisim"]) {
    const r = await get(path);
    if (r.status !== 200) continue;
    // Panelden düzenlenen metinlerde yer tutucu doldurulmamış kalmasın ({{unvan}} vb.)
    const raw = (r.text.match(/\{\{\s*[a-z_]+\s*\}\}/) || [])[0];
    raw ? add("fail", `Yer tutucu doldurulmamış: ${path}`, `${raw} — Ayarlar › Sayfalar'da yazım hatası olabilir`) : add("ok", `Yer tutucular dolu: ${path}`);
    liveOnly(!r.text.includes("Taslak:") && !r.text.includes("noindex"), `Hukuki metin yayında: ${path}`, "taslak / arama motoruna kapalı — onaydan sonra draft kaldırılmalı");
    liveOnly(!r.text.includes("(eklenecek)"), `Künye eksiksiz: ${path}`, "telefon / MERSİS / KEP eksik (src/config/company.ts)");
  }
  const nf = await get("/bu-sayfa-kesinlikle-yok-123");
  nf.status === 404 ? add("ok", "Olmayan sayfa → 404") : add("warn", "Olmayan sayfa", `HTTP ${nf.status} (404 beklenirdi)`);
  // KVKK C2: Google Analytics betiği izin verilmeden sayfaya doğrudan eklenmez (yalnız izinle __yhGA yükler)
  {
    const h0 = await get("/");
    /<script[^>]+src="https:\/\/www\.googletagmanager\.com\/gtag\/js/.test(h0.text)
      ? add("fail", "Google Analytics onaysız yükleniyor", "gtag.js sayfada doğrudan var")
      : add("ok", "Google Analytics yalnız çerez izniyle yükleniyor");
  }
  // Ana sayfa metinleri panelden (Ayarlar › Ana Sayfa): kayıtlı ilk prensip başlığı (yoksa varsayılan) sayfada görünmeli
  {
    const q = one("SELECT coalesce(home_content->'principles'->'items'->0->>'title', '') FROM public.settings ORDER BY id LIMIT 1") || "Geniş parmak alanı";
    const h = await get("/");
    const esc = (t) => t.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
    h.text.includes(q) || h.text.includes(esc(q)) ? add("ok", "Ana sayfa metinleri panelden okunuyor") : add("fail", "Ana sayfa metni panelle uyuşmuyor", `"${q}" sayfada yok`);
  }
  if (prod) {
    // Mağaza = seçim ekranı; ürünler segment mağazasında (Yetişkin / 0–4 Yaş İlkadım)
    const m = await get("/magaza");
    m.text.includes("/magaza/yetiskin") && m.text.includes("/magaza/ilkadim") ? add("ok", "Mağaza seçim ekranı iki mağazaya yönlendiriyor") : add("fail", "Mağaza seçim ekranında segment bağlantıları yok", `HTTP ${m.status}`);
    const sm = await get(`/magaza/${prod[2] === "ilkadim" ? "ilkadim" : "yetiskin"}`);
    sm.text.includes(`/products/${prod[0]}`) ? add("ok", "Segment mağazasında ürün listeleniyor") : add("fail", "Segment mağazasında ürün yok", `${prod[1]} (${prod[2]}) görünmüyor`);
  }
  // Ana sayfa: kategori kutuları segment mağazasına gidiyor + ilk prensip görseli açılıyor (karşılama videosu kalktı)
  {
    const h = await get("/");
    /href="\/magaza\/(yetiskin\?kategori=|ilkadim)/.test(h.text) ? add("ok", "Ana sayfa kategori kutuları segment mağazasına bağlı") : add("fail", "Ana sayfada kategori kutusu yok", "/magaza/yetiskin?kategori=… ya da /magaza/ilkadim bağlantısı bulunamadı");
    /data-tile-price[^>]*>₺\d/.test(h.text) ? add("ok", "Kategori kutularında fiyat aralığı var") : add("fail", "Kategori kutusunda fiyat yok", "en düşük – en yüksek fiyat görünmüyor (page.tsx › getCategoryTiles)");
    h.text.includes("populer-desktop") ? add("fail", "Masaüstü ana sayfada 'Popüler Modeller' bölümü duruyor", "kaldırılmıştı (2026-10-18)") : add("ok", "Masaüstü ana sayfa: Popüler Modeller kaldırıldı");
    const img = one("SELECT coalesce(home_content->'principles'->'items'->0->>'image', '') FROM public.settings ORDER BY id LIMIT 1") || "/principles/1-genis-parmak.svg";
    if (img.startsWith("/")) {
      const r = await fetch(APP + img, { method: "HEAD" }).catch(() => null);
      r?.ok ? add("ok", "Prensip görseli açılıyor", img) : add("fail", "Prensip görseli açılmıyor", `${img} HTTP ${r?.status ?? "bağlantı yok"} — Ayarlar › Ana Sayfa › Barefoot prensipleri`);
    } else add("ok", "Prensip görseli (dış adres)", img);
  }
  // Yazı tipleri sitenin içinden (public/fonts) — derleme Google'a bağlı değil; dosya açılmazsa site sistem yazısıyla görünür
  {
    const r = await fetch(APP + "/fonts/inter-latin-wght-normal.woff2", { method: "HEAD" }).catch(() => null);
    r?.ok ? add("ok", "Yazı tipi dosyaları açılıyor") : add("fail", "Yazı tipi dosyası açılmıyor", `/fonts/inter-latin-wght-normal.woff2 HTTP ${r?.status ?? "bağlantı yok"}`);
  }

  // 3) Uç noktalar ve yetki
  });
  await part("Uç noktalar ve yetki", async () => {
  const api = [
    ["Cron (pazaryeri) şifresiz → 401", "/api/cron/marketplace-sync", { method: "POST" }, 401],
    ["Cron (süresi dolan sipariş) şifresiz → 401", "/api/cron/expire-orders", { method: "POST" }, 401],
    ["Cron (sağlık) şifresiz → 401", "/api/cron/server-health", { method: "POST" }, 401],
    ["Admin ayarları girişsiz → 401", "/api/admin/settings", {}, 401],
    ["Sistem durumu girişsiz → 401", "/api/admin/system-status", {}, 401],
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
    : iyz.status === 503 ? liveOnly(false, "Kart ödeme kapalı", "iyzico anahtarları tanımlı değil ya da Ayarlar › Ödeme Yöntemleri'nde kart kapalı")
    : add("ok", "Kart ödeme başlatma ucu yanıt veriyor", `HTTP ${iyz.status}`);

  // 4) Dışarıdan veri erişimi (anon anahtarla, Supabase üzerinden)
  });
  await part("Arama motoru ve yapay zekâ görünürlüğü (SEO / GEO)", async () => {
    // Kök düzendeki canonical alt sayfalara miras kalıp "asıl sayfam ana sayfa" diyordu (2026-10-11 düzeltildi)
    const canon = (html) => (html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/) || [])[1] || "";
    const bn = await get("/barefoot-nedir");
    const c1 = canon(bn.text);
    c1.endsWith("/barefoot-nedir") ? add("ok", "Eğitim sayfası kendi adresini gösteriyor (canonical)") : add("fail", "Eğitim sayfası canonical hatalı", `"${c1 || "yok"}" — ana sayfayı gösterirse Google dizinden düşürür`);
    const p = one("SELECT slug FROM public.products WHERE is_active ORDER BY created_at DESC LIMIT 1");
    if (p) {
      const r = await get(`/products/${p}`);
      const c2 = canon(r.text);
      c2.endsWith(`/products/${p}`) ? add("ok", "Ürün sayfası canonical doğru") : add("fail", "Ürün sayfası canonical hatalı", c2 || "yok");
      const md = (r.text.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
      md && md.length <= 170 ? add("ok", "Ürün meta açıklaması kısa ve dolu", `${md.length} karakter`) : add("warn", "Ürün meta açıklaması", md ? `${md.length} karakter (≤160 olmalı)` : "yok");
      /"@type":"Product"/.test(r.text) ? add("ok", "Ürün yapısal verisi (Product) var") : add("fail", "Ürün yapısal verisi yok");
      // Yapay zekâ tarayıcıları JavaScript çalıştırmaz: ürün adı ve açıklaması ilk HTML'de olmalı
      const title = one(`SELECT title FROM public.products WHERE slug = ${lit(p)}`);
      r.text.includes(title.replace(/&/g, "&amp;")) ? add("ok", "Ürün içeriği JavaScript olmadan okunuyor") : add("fail", "Ürün içeriği ilk HTML'de yok", "yapay zekâ tarayıcıları göremez");
    }
    // Dodura ürün sayfasında teknik bilgiler (taban katmanları, ağırlık) metin + yapısal veri olarak (src/config/product-specs.ts)
    const dp = one("SELECT p.slug FROM public.products p JOIN public.brands b ON b.id = p.brand_id WHERE p.is_active AND lower(b.name) = 'dodura' LIMIT 1");
    if (dp) {
      const r = await get(`/products/${dp}`);
      r.text.includes("Ayak ile zemin arası") && r.text.includes('"additionalProperty"') ? add("ok", "Dodura teknik bilgileri sayfada ve yapısal veride")
        : add("fail", "Dodura teknik bilgileri eksik", "Teknik bilgiler tablosu / additionalProperty yok");
    }
    const home = await get("/");
    /"@type":"OnlineStore"/.test(home.text) && home.text.includes("/ara?q=") ? add("ok", "Mağaza kimliği yapısal verisi (OnlineStore + arama)") : add("fail", "Mağaza kimliği yapısal verisi eksik");
    // Aynı soruyu cevaplayan eski yazı ana rehbere kalıcı yönlendiriliyor (next.config)
    const rd = await get("/bilgi-bankasi/barefoot-ayakkabi-nedir");
    [301, 308].includes(rd.status) ? add("ok", "Eski \"barefoot nedir\" yazısı ana rehbere yönleniyor") : add("fail", "Eski yazı yönlenmiyor", `HTTP ${rd.status}`);
    // Ürün beslemesi: renk / yaş grubu (Merchant Center yapay zekâ alışverişi) — Dodura varsa
    if (one("SELECT EXISTS(SELECT 1 FROM public.products p JOIN public.brands b ON b.id = p.brand_id WHERE p.is_active AND lower(b.name) = 'dodura')") === "t") {
      const S = SETTINGS();
      const fd = await get(`/feed/google-merchant${S.gmc_feed_secret ? `?secret=${encodeURIComponent(S.gmc_feed_secret)}` : ""}`);
      fd.text.includes("<g:age_group>adult</g:age_group>") && fd.text.includes("<g:color>") && fd.text.includes("<g:product_highlight>")
        ? add("ok", "Beslemede renk / yaş grubu / öne çıkanlar var") : add("fail", "Beslemede ürün özellikleri eksik", `HTTP ${fd.status}`);
    }
    const sm = await get("/sitemap.xml");
    const hasKb = one("SELECT EXISTS(SELECT 1 FROM public.kb_articles)") === "t";
    sm.text.includes("/kategori/") && (!hasKb || sm.text.includes("/bilgi-bankasi/")) && sm.text.includes("/barefoot-nedir")
      ? add("ok", "Site haritasında kategori + rehber sayfaları var") : add("fail", "Site haritası eksik", "kategori / bilgi bankası / barefoot-nedir");
    const rb = await get("/robots.txt");
    liveOnly(!/Disallow: \/\s*$/m.test(rb.text) && !/OAI-SearchBot[\s\S]{0,40}Disallow: \//.test(rb.text), "robots.txt arama ve yapay zekâ tarayıcılarına açık", "canlıda site taramaya kapalı (NEXT_PUBLIC_NOINDEX kaldırılmalı)");
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
    // Beden tablosu: ölçü tablosu olan markanın ürününde "Numaramı bul" görünüyor
    const scp = sql("SELECT p.slug FROM public.products p JOIN public.size_charts s ON s.brand_id = p.brand_id WHERE p.is_active AND p.has_variants ORDER BY p.created_at DESC LIMIT 1")[0];
    if (scp) {
      const pg2 = await get(`/products/${scp[0]}`);
      pg2.status === 200 && pg2.text.includes("Numaramı bul") ? add("ok", "Ürün sayfasında beden tablosu / Numaramı bul") : add("fail", "Ürün sayfasında 'Numaramı bul' yok", `/products/${scp[0]} HTTP ${pg2.status}`);
    }
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
    const scr = await rest("size_charts?select=brand_id&limit=1");
    scr.status === 200 ? add("ok", "Ölçü tabloları okunabiliyor") : add("fail", "Ölçü tabloları okunamıyor", `HTTP ${scr.status} — ürün sayfasında beden tablosu çıkmaz`);
    const scw = await rest("size_charts", { method: "POST", body: JSON.stringify({ brand_id: "00000000-0000-0000-0000-000000000000", rows: [] }) });
    scw.status >= 400 ? add("ok", "Ölçü tablosu dışarıdan değiştirilemiyor") : add("fail", "Ölçü tablosu dışarıdan DEĞİŞTİRİLEBİLİYOR", `HTTP ${scw.status}`);
    // Video kovası: herkes izler ama dışarıdan yükleme yapılamaz
    try {
      const up = await fetch(`${SB_URL}/storage/v1/object/media/regresyon-yetki-denemesi.mp4`, {
        method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "video/mp4" }, body: "x", signal: AbortSignal.timeout(15000),
      });
      up.status >= 400 ? add("ok", "Video kovasına dışarıdan yükleme yapılamıyor") : add("fail", "Video kovasına dışarıdan YÜKLENEBİLİYOR", `HTTP ${up.status} — 20261104 migration'ı`);
    } catch (e) { add("warn", "Video kovası yükleme yetkisi kontrol edilemedi", String(e?.message || e)); }
    for (const [tbl, label] of [["consent_log", "Çerez onay defteri"], ["analytics_anon_daily", "Kimliksiz ziyaret sayacı"]]) {
      const r = await rest(`${tbl}?select=*&limit=1`);
      r.status >= 400 || (Array.isArray(r.json) && r.json.length === 0) ? add("ok", `${label} dışarıya kapalı`) : add("fail", `${label} dışarıya AÇIK`, `HTTP ${r.status} — 20261109 migration'ı`);
    }
    const spw = await rest("static_pages", { method: "POST", body: { slug: "regresyon-yetki", title: "x", body: "x", draft: false } });
    spw.status >= 400 ? add("ok", "Sayfa metinleri dışarıdan değiştirilemiyor") : add("fail", "Sayfa metinleri dışarıdan DEĞİŞTİRİLEBİLİYOR", `HTTP ${spw.status} — 20261110 migration'ı`);
    const mh = await rest("mail_health?select=last_error&limit=1");
    mh.status >= 400 || (Array.isArray(mh.json) && mh.json.length === 0) ? add("ok", "E-posta sağlık kaydı dışarıya kapalı") : add("fail", "E-posta sağlık kaydı dışarıya AÇIK", `HTTP ${mh.status} — 20261106 migration'ı`);
    const cer = await rest("client_errors?select=message&limit=1");
    cer.status >= 400 || (Array.isArray(cer.json) && cer.json.length === 0) ? add("ok", "Müşteri hata kayıtları dışarıya kapalı") : add("fail", "Müşteri hata kayıtları dışarıya AÇIK", `HTTP ${cer.status} — 20261105 migration'ı`);
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
  // Ürün kodu adın sonunda değil "Ürün kodu" alanında olmalı (20261111; SEO — docs/SEO-GEO-ANALIZ.md)
  const codeTitle = sql("SELECT title FROM public.products WHERE is_active AND title ~ '\\s[A-Z]{2,}[A-Z0-9]*[0-9]{2}\\s*$' ORDER BY title LIMIT 10").map((r) => r[0]);
  codeTitle.length ? add("warn", "Ürün adının sonunda stok kodu var (ürün sayfasında \"Ürün kodu\" alanına taşı)", codeTitle.join(", ")) : add("ok", "Ürün adlarında stok kodu yok");
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
  // Ölçü tabloları: aralıklar geçerli ve çakışmasız (Ayarlar › Markalar › Ölçü tablosu)
  for (const [bn, rowsJson] of sql("SELECT b.name, s.rows::text FROM public.size_charts s JOIN public.brands b ON b.id = s.brand_id")) {
    const rr = (JSON.parse(rowsJson || "[]") || []).slice().sort((a, b) => a.min_mm - b.min_mm);
    const bad = rr.find((r, i) => !(r.min_mm <= r.max_mm) || (i > 0 && r.min_mm <= rr[i - 1].max_mm));
    bad ? add("warn", `Ölçü tablosu hatalı: ${bn}`, `“${bad.label}” aralığı hatalı ya da çakışıyor`) : add("ok", `Ölçü tablosu: ${bn}`, `${rr.length} satır`);
  }
  const badSlug = num("SELECT count(*) FROM public.kb_articles WHERE slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'");
  badSlug ? add("warn", "Bilgi bankası adresi bozuk", `${badSlug} makale`) : add("ok", "Bilgi bankası adresleri düzgün");
  const shipping = num("SELECT count(*) FROM public.shipping_methods WHERE is_active");
  shipping ? add("ok", "Aktif kargo yöntemi var", `${shipping}`) : add("fail", "Aktif kargo yöntemi YOK", "ödeme yapılamaz");
  const defShip = sql("SELECT name, is_active FROM public.shipping_methods WHERE is_default");
  defShip.length === 1 && defShip[0][1] === "t" ? add("ok", "Varsayılan kargo yöntemi", defShip[0][0])
    : add("fail", "Varsayılan kargo yöntemi yok ya da pasif", "Ayarlar › Kargo Yöntemleri › Varsayılan yap");
  // Gelecek tarihli sipariş (pazaryeri saat dilimi hatası — Trendyol orderDate GMT+3; Paraşüt "sipariş tarihi ileri olamaz" der)
  const future = sql("SELECT channel, count(*) FROM public.orders WHERE created_at > now() + interval '5 minutes' GROUP BY channel");
  future.length ? add("warn", "Gelecek tarihli sipariş var", future.map((r) => `${r[0]}: ${r[1]}`).join(" · ") + " — saat dilimi çevirisi hatalı olabilir")
    : add("ok", "Gelecek tarihli sipariş yok");
  const mktFailed = num("SELECT count(*) FROM public.marketplace_stock_sync WHERE status='failed'");
  // Kanal + sebep kırılımı (hangi pazaryeri, ne hatası) — kapalı kanalın eski hataları da görünür, "(kapalı)" yazar
  const mktWhy = mktFailed ? sql(`SELECT s.channel, count(*), left(coalesce(min(s.error), '—'), 140),
      coalesce((SELECT CASE s.channel WHEN 'trendyol' THEN st.trendyol_enabled WHEN 'hepsiburada' THEN st.hepsiburada_enabled WHEN 'amazon' THEN st.amazon_enabled END
        FROM public.settings st ORDER BY st.id LIMIT 1), false)
    FROM public.marketplace_stock_sync s WHERE s.status='failed' GROUP BY s.channel ORDER BY 2 DESC`) : [];
  mktFailed ? add("warn", "Pazaryeri stok gönderim hatası", `${mktFailed} kayıt — ` + mktWhy.map((r) => `${r[0]}${r[3] === "t" ? "" : " (kapalı)"} ${r[1]}: ${r[2]}`).join(" · ") + " (Ayarlar › Entegrasyonlar › Tüm stokları gönder)")
    : add("ok", "Pazaryeri stok hatası yok");
  // Aynı ilan kodu (barkod / satıcı kodu) iki varyantta → pazaryerine tek gider ama hangisinin stoğu / fiyatı doğru belli
  // olmaz (Hepsiburada eskiden bütün paketi reddediyordu: DuplicateMerchantSkuSpecified). Harf / boşluk farkı aynı sayılır.
  const dupKeys = sql(`SELECT ch, k, count(*), string_agg(p.title || ' (' || CASE WHEN coalesce(v.is_active,true) AND p.is_active THEN 'aktif' ELSE 'pasif' END || ')', ', ')
    FROM public.product_variants v JOIN public.products p ON p.id = v.product_id
    CROSS JOIN unnest(ARRAY['trendyol','hepsiburada','amazon']) ch
    CROSS JOIN LATERAL (SELECT upper(btrim(public.marketplace_listing_key(ch, v.barcode, v.sku))) AS k) x
    WHERE x.k IS NOT NULL AND public.marketplace_is_listed(ch, x.k)
    GROUP BY ch, k HAVING count(*) > 1 ORDER BY ch, k LIMIT 10`);
  dupKeys.length
    ? add("warn", "Aynı pazaryeri kodu birden çok varyantta", dupKeys.map((r) => `${r[0]} ${r[1]}: ${r[3]}`).join(" · ").slice(0, 600) + " → fazla olanın barkod / SKU'sunu sil ya da düzelt")
    : add("ok", "Pazaryeri kodları tekil");
  const qFailed = num("SELECT count(*) FROM public.email_queue WHERE status='failed' AND created_at > now() - interval '7 days'");
  qFailed ? add("warn", "Gönderilemeyen e-posta (son 7 gün)", `${qFailed}`) : add("ok", "E-posta kuyruğunda hata yok");

  // 6) Ayarlar ve ortam
  });
  await part("Ayarlar ve ortam", async () => {
    // Kurulu paketler package-lock ile aynı mı (git pull sonrası npm ci atlanırsa güvenlik güncellemesi kurulmamış kalır)
    try {
      const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8")).packages || {};
      const stale = ["next", "sharp", "@tiptap/extension-table", "iyzipay", "nodemailer"].filter((n) => {
        const want = lock[`node_modules/${n}`]?.version;
        if (!want) return false;
        try { return JSON.parse(readFileSync(new URL(`../node_modules/${n}/package.json`, import.meta.url), "utf8")).version !== want; } catch { return true; }
      });
      stale.length ? add("fail", "Kurulu paketler eski", `${stale.join(", ")} — çalıştır: npm ci --no-audit --no-fund && bash scripts/deploy.sh`) : add("ok", "Kurulu paketler package-lock ile aynı");
    } catch (e) { add("warn", "Paket sürümleri kontrol edilemedi", String(e?.message || e)); }
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
  liveOnly(S.card_payment_enabled === true, "Kart ödemesi kapalı", "Ayarlar › Ödeme Yöntemleri › Kredi / Banka Kartı'nı aç");
  // Ödeme sayfası kart seçeneğini tarayıcıdan okur → sütun dışarıya açık olmalı (yalnız bu sütun)
  {
    const r = await rest("settings?select=card_payment_enabled&limit=1");
    r.status === 200 ? add("ok", "Kart ödemesi ayarı ödeme sayfasından okunuyor") : add("fail", "Kart ödemesi ayarı okunamıyor", `HTTP ${r.status} — GRANT SELECT (card_payment_enabled) eksik`);
  }
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
  const beat = () => Number(one("SELECT extract(epoch FROM now()-last_run_at)/60 FROM public.cron_heartbeats WHERE name='marketplace-sync'") || 9999);
  let beatM = beat();
  // Deploy sırasında site (ve dakikalık iş) birkaç dakika durur; regresyon site açılır açılmaz başlar →
  // eski görünürse bir sonraki dakikalık çalışmayı en çok ~2 dk bekle (gerçekten durmuşsa yine HATA)
  let waited = false;
  if (mktOn && beatM >= 10) {
    waited = true;
    for (let i = 0; i < 12 && beatM >= 10; i++) { await sleep(10_000); beatM = beat(); }
  }
  if (mktOn) beatM < 10 ? add("ok", "Pazaryeri senkronu", waited ? "deploy sırasında durmuştu, yeniden çalışıyor" : `${beatM.toFixed(0)} dk önce`) : add("fail", "Pazaryeri senkronu durmuş", `${beatM >= 9999 ? "hiç" : beatM.toFixed(0) + " dk önce"} (2 dk beklendi) — pm2 logs yerihisset`);
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
