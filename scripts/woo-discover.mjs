#!/usr/bin/env node
// FAZ 0 — WooCommerce KEŞİF (salt okunur). Eski sitelerin (yerihisset.com,
// attipas.com.tr) müşteri/sipariş/ürün verisini WooCommerce REST API ile tarar,
// yeni sisteme nasıl oturacağını ölçen bir RAPOR üretir. Hiçbir yere YAZMAZ:
// ne eski sitelere ne yeni veritabanına.
//
// Rapor kişisel veri içermez (yalnız sayılar, oranlar, alan adları). Eşleşmeyen
// ürünler listesi (ürün adı/SKU) ayrıca CSV olarak .woo-report/ altına yazılır.
//
// Anahtarlar: /opt/yerihisset-app/.env.woo (git'e girmez):
//   WOO_YERIHISSET_URL=https://yerihisset.com
//   WOO_YERIHISSET_KEY=ck_...      WOO_YERIHISSET_SECRET=cs_...
//   WOO_ATTIPAS_URL=https://attipas.com.tr
//   WOO_ATTIPAS_KEY=ck_...         WOO_ATTIPAS_SECRET=cs_...
// (WooCommerce › Ayarlar › Gelişmiş › REST API › İzin: "Okuma")
//
// Kullanım (sunucuda, /opt/yerihisset-app içinde):
//   node scripts/woo-discover.mjs                 # tanımlı tüm siteler
//   node scripts/woo-discover.mjs --site=attipas  # tek site

import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

for (const name of [".env.woo", ".env.local", ".env", ".env.production.local", ".env.production"]) {
  try {
    for (const line of readFileSync(new URL(`../${name}`, import.meta.url), "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* bu dosya yoksa geç */ }
}

const OUT_DIR = new URL("../.woo-report/", import.meta.url);
const onlySite = (process.argv.find((a) => a.startsWith("--site=")) || "").split("=")[1];

const SITES = [
  { code: "yerihisset", label: "YeriHisset (eski site)" },
  { code: "attipas", label: "Attipas" },
].map((s) => {
  const P = `WOO_${s.code.toUpperCase()}_`;
  return { ...s, url: (process.env[P + "URL"] || "").replace(/\/+$/, ""), key: process.env[P + "KEY"], secret: process.env[P + "SECRET"] };
}).filter((s) => (!onlySite || s.code === onlySite));

// ── Yardımcılar ────────────────────────────────────────────────────────────
const norm = (v) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, "");
const lower = (v) => String(v ?? "").trim().toLowerCase();
const trFold = (v) => String(v ?? "").toLocaleLowerCase("tr-TR")
  .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
  .replace(/[^a-z0-9]/g, "");
const inc = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");
const money = (n) => `₺${Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`;
const top = (m, n = 15) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const BARCODE_KEY = /barcode|barkod|gtin|ean|upc|isbn/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function phone10(p) {
  let d = String(p ?? "").replace(/\D/g, "");
  if (d.startsWith("90") && d.length === 12) d = d.slice(2);
  if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  return d.length === 10 && d.startsWith("5") ? d : null;
}

// Yeni sitenin il/ilçe listesi (src/lib/turkey-geo.ts; TS'i içe aktarmadan okuruz)
function loadGeo() {
  const src = readFileSync(new URL("../src/lib/turkey-geo.ts", import.meta.url), "utf8");
  const cities = JSON.parse(src.match(/CITIES: string\[\] = (\[[\s\S]*?\]);/)[1].replace(/,\s*\]/, "]"));
  const districts = {};
  for (const m of src.matchAll(/^\s*"([^"]+)": (\[[^\]]*\]),?\r?$/gm)) districts[m[1]] = JSON.parse(m[2]);
  return { cities, districts };
}
const GEO = loadGeo();
// WooCommerce Türkiye il kodları TR01…TR81 = plaka sırası; CITIES alfabetik → plaka listesi ayrı
const PLATE = ["Adana","Adıyaman","Afyonkarahisar","Ağrı","Amasya","Ankara","Antalya","Artvin","Aydın","Balıkesir","Bilecik","Bingöl","Bitlis","Bolu","Burdur","Bursa","Çanakkale","Çankırı","Çorum","Denizli","Diyarbakır","Edirne","Elazığ","Erzincan","Erzurum","Eskişehir","Gaziantep","Giresun","Gümüşhane","Hakkari","Hatay","Isparta","Mersin","İstanbul","İzmir","Kars","Kastamonu","Kayseri","Kırklareli","Kırşehir","Kocaeli","Konya","Kütahya","Malatya","Manisa","Kahramanmaraş","Mardin","Muğla","Muş","Nevşehir","Niğde","Ordu","Rize","Sakarya","Samsun","Siirt","Sinop","Sivas","Tekirdağ","Tokat","Trabzon","Tunceli","Şanlıurfa","Uşak","Van","Yozgat","Zonguldak","Aksaray","Bayburt","Karaman","Kırıkkale","Batman","Şırnak","Bartın","Ardahan","Iğdır","Yalova","Karabük","Kilis","Osmaniye","Düzce"];
const CITY_BY_FOLD = new Map(GEO.cities.map((c) => [trFold(c), c]));
function resolveCity(state, cityText) {
  const m = /^TR(\d{2})$/.exec(String(state || "").trim().toUpperCase());
  if (m) return PLATE[Number(m[1]) - 1] || null;
  return CITY_BY_FOLD.get(trFold(state)) || CITY_BY_FOLD.get(trFold(cityText)) || null;
}
function resolveDistrict(city, text) {
  if (!city) return null;
  const list = GEO.districts[city] || [];
  const f = trFold(text);
  if (!f) return null;
  return list.find((d) => trFold(d) === f) || list.find((d) => f.includes(trFold(d)) && trFold(d).length >= 4) || null;
}

// ── WooCommerce istemcisi ────────────────────────────────────────────────────
function wooClient(site) {
  let useQuery = false; // bazı sunucular Authorization başlığını düşürür → anahtarı sorguda gönder
  async function get(path, params = {}) {
    for (let attempt = 1; ; attempt++) {
      const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
      if (useQuery) { qs.set("consumer_key", site.key); qs.set("consumer_secret", site.secret); }
      const headers = { Accept: "application/json", "User-Agent": "YeriHisset-Migration/1.0" };
      if (!useQuery) headers.Authorization = "Basic " + Buffer.from(`${site.key}:${site.secret}`).toString("base64");
      let res;
      try {
        res = await fetch(`${site.url}/wp-json/wc/v3${path}?${qs}`, { headers, signal: AbortSignal.timeout(60000) });
      } catch (e) {
        if (attempt < 4) { await sleep(2000 * attempt); continue; }
        throw new Error(`${path}: ağ hatası (${e.message})`);
      }
      if (res.status === 401 && !useQuery) { useQuery = true; continue; }
      if ((res.status === 429 || res.status >= 500) && attempt < 4) { await sleep(3000 * attempt); continue; }
      const text = await res.text();
      if (!res.ok) {
        let msg = text.slice(0, 200);
        try { const j = JSON.parse(text); msg = `${j.code || ""} ${j.message || ""}`.trim(); } catch { /* düz metin */ }
        throw new Error(`${path}: HTTP ${res.status} ${msg}`);
      }
      return { data: JSON.parse(text), total: Number(res.headers.get("x-wp-total") || 0), pages: Number(res.headers.get("x-wp-totalpages") || 1) };
    }
  }
  async function all(path, params = {}, label = path) {
    const out = [];
    let page = 1, pages = 1;
    do {
      const r = await get(path, { per_page: 100, page, ...params });
      out.push(...r.data);
      pages = r.pages || 1;
      process.stdout.write(`\r  ${label}: ${out.length}${r.total ? ` / ${r.total}` : ""}   `);
      page++;
    } while (page <= pages);
    process.stdout.write("\n");
    return out;
  }
  return { get, all };
}

// ── Yeni sistem (yalnız OKUMA) ───────────────────────────────────────────────
async function loadNewSystem() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.log("! Yeni sistem bilgileri yok → ürün/müşteri karşılaştırması atlanır."); return null; }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const page = async (table, cols) => {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(table).select(cols).range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return rows;
  };
  const variants = await page("product_variants", "id, sku, barcode");
  const profiles = await page("profiles", "email");
  const bySku = new Map(), byBarcode = new Map();
  for (const v of variants) {
    if (v.sku) bySku.set(norm(v.sku), v.id);
    if (v.barcode) byBarcode.set(norm(v.barcode), v.id);
  }
  return { bySku, byBarcode, emails: new Set(profiles.map((p) => lower(p.email)).filter(Boolean)), variantCount: variants.length };
}

// ── Bir siteyi tara ──────────────────────────────────────────────────────────
async function discover(site, ns) {
  const L = [];
  const log = (s = "") => L.push(s);
  const wc = wooClient(site);
  console.log(`\n▶ ${site.label} (${site.url})`);

  // Sistem bilgisi (yetki yoksa geç)
  try {
    const { data } = await wc.get("/system_status");
    const env = data?.environment || {};
    const set = data?.settings || {};
    log(`WooCommerce ${env.version || "?"} · WordPress ${env.wp_version || "?"} · para birimi ${set.currency || "?"}`);
    const hpos = data?.settings?.HPOS_enabled ?? data?.settings?.hpos_enabled;
    if (hpos !== undefined) log(`HPOS (yeni sipariş tabloları): ${hpos ? "açık" : "kapalı"}`);
  } catch (e) {
    log(`(sistem bilgisi okunamadı: ${e.message.slice(0, 80)})`);
  }

  // ÜRÜNLER + varyasyonlar → eski ürün id → {sku, barkodlar}
  const products = await wc.all("/products", { status: "any" }, "ürünler");
  const prodInfo = new Map(); // woo product/variation id → { sku, barcodes[] , name }
  const metaKeyCount = new Map();
  const barcodeKeys = new Map();
  let variationTotal = 0;
  const collect = (p, name) => {
    const barcodes = [];
    if (p.global_unique_id) { barcodes.push(p.global_unique_id); inc(barcodeKeys, "global_unique_id (WooCommerce GTIN alanı)"); }
    for (const m of p.meta_data || []) {
      inc(metaKeyCount, m.key);
      if (BARCODE_KEY.test(m.key) && m.value && typeof m.value !== "object") { barcodes.push(String(m.value)); inc(barcodeKeys, m.key); }
    }
    prodInfo.set(p.id, { sku: p.sku || "", barcodes, name });
  };
  for (const p of products) {
    collect(p, p.name);
    if (p.type === "variable") {
      const vars = await wc.all(`/products/${p.id}/variations`, {}, `  varyasyon #${p.id}`);
      variationTotal += vars.length;
      for (const v of vars) collect(v, `${p.name} · ${(v.attributes || []).map((a) => a.option).join(" / ")}`);
    }
  }
  const withSku = [...prodInfo.values()].filter((x) => x.sku).length;
  const withBarcode = [...prodInfo.values()].filter((x) => x.barcodes.length).length;

  // MÜŞTERİLER (kayıtlı üyeler)
  const customers = await wc.all("/customers", { role: "all" }, "üyeler");

  // SİPARİŞLER
  const orders = await wc.all("/orders", { status: "any", order: "asc", orderby: "date" }, "siparişler");

  // ── Analiz ──
  const status = new Map(), statusRevenue = new Map(), payment = new Map(), createdVia = new Map(), shipping = new Map(), currency = new Map(), byYear = new Map(), yearRevenue = new Map();
  const orderMeta = new Map(), itemMeta = new Map();
  const emails = new Map(); // email → { orders, member }
  let guestOrders = 0, noEmail = 0, badEmail = 0, badPhone = 0, refundOrders = 0, refundTotal = 0, couponOrders = 0, feeOrders = 0, noteOrders = 0, numberDiffers = 0;
  let cityOk = 0, districtOk = 0, addrTotal = 0;
  let items = 0, mSku = 0, mBarcode = 0, mNone = 0, deletedProduct = 0;
  const unmatched = new Map(); // anahtar → { name, sku, barcode, qty, orders }
  let first = null, last = null;

  for (const c of customers) {
    const e = lower(c.email);
    if (!e) continue;
    if (!emails.has(e)) emails.set(e, { orders: 0, member: true });
    else emails.get(e).member = true;
  }

  for (const o of orders) {
    inc(status, o.status);
    inc(statusRevenue, o.status, Number(o.total || 0));
    inc(payment, o.payment_method_title || o.payment_method || "(yok)");
    inc(createdVia, o.created_via || "(boş)");
    inc(currency, o.currency || "?");
    for (const s of o.shipping_lines || []) inc(shipping, s.method_title || s.method_id || "(adsız)");
    const y = String(o.date_created || "").slice(0, 4);
    inc(byYear, y);
    if (!["cancelled", "failed", "trash", "checkout-draft", "pending"].includes(o.status)) inc(yearRevenue, y, Number(o.total || 0));
    if (!first || o.date_created < first) first = o.date_created;
    if (!last || o.date_created > last) last = o.date_created;
    if (String(o.number) !== String(o.id)) numberDiffers++;
    if (!o.customer_id) guestOrders++;
    if ((o.refunds || []).length) { refundOrders++; refundTotal += (o.refunds || []).reduce((a, r) => a + Math.abs(Number(r.total || 0)), 0); }
    if ((o.coupon_lines || []).length) couponOrders++;
    if ((o.fee_lines || []).length) feeOrders++;
    if (o.customer_note) noteOrders++;
    for (const m of o.meta_data || []) inc(orderMeta, m.key);

    const b = o.billing || {}, sh = o.shipping || {};
    const e = lower(b.email);
    if (!e) noEmail++;
    else if (!EMAIL_RE.test(e)) badEmail++;
    else {
      if (!emails.has(e)) emails.set(e, { orders: 0, member: false });
      emails.get(e).orders++;
    }
    if (!phone10(b.phone || sh.phone)) badPhone++;
    const addr = sh.address_1 ? sh : b;
    if (addr.address_1 || addr.city || addr.state) {
      addrTotal++;
      const city = resolveCity(addr.state, addr.city);
      if (city) { cityOk++; if (resolveDistrict(city, addr.city) || resolveDistrict(city, addr.address_2)) districtOk++; }
    }

    for (const li of o.line_items || []) {
      items++;
      for (const m of li.meta_data || []) inc(itemMeta, m.key);
      const info = prodInfo.get(li.variation_id) || prodInfo.get(li.product_id);
      if (!li.product_id || !info) deletedProduct++;
      const skus = [li.sku, info?.sku].filter(Boolean).map(norm);
      const bcs = [...(info?.barcodes || []), ...(li.meta_data || []).filter((m) => BARCODE_KEY.test(m.key)).map((m) => m.value)].filter(Boolean).map(norm);
      if (ns && skus.some((s) => ns.bySku.has(s) || ns.byBarcode.has(s))) mSku++;
      else if (ns && bcs.some((x) => ns.byBarcode.has(x) || ns.bySku.has(x))) mBarcode++;
      else {
        mNone++;
        const k = skus[0] || bcs[0] || `ad:${li.name}`;
        const u = unmatched.get(k) || { name: info?.name || li.name, sku: skus[0] || "", barcode: bcs[0] || "", qty: 0, orders: 0 };
        u.qty += Number(li.quantity || 0); u.orders++;
        unmatched.set(k, u);
      }
    }
  }

  const emailList = [...emails.entries()];
  const withOrders = emailList.filter(([, v]) => v.orders > 0).length;
  const membersNoOrder = emailList.filter(([, v]) => v.member && v.orders === 0).length;
  const guestOnly = emailList.filter(([, v]) => !v.member && v.orders > 0).length;
  const existingNew = ns ? emailList.filter(([e]) => ns.emails.has(e)).length : null;

  // ── Rapor ──
  log("");
  log(`ÜRÜNLER: ${products.length} ürün + ${variationTotal} varyasyon · SKU'lu ${withSku} · barkodlu ${withBarcode}`);
  log(`  Barkodun durduğu alan(lar): ${barcodeKeys.size ? top(barcodeKeys, 5).map(([k, n]) => `${k} (${n})`).join(", ") : "BULUNAMADI"}`);
  log(`  Ürün ek alanları (ilk 15): ${top(metaKeyCount).map(([k, n]) => `${k}(${n})`).join(", ") || "—"}`);
  log("");
  log(`MÜŞTERİLER: ${emailList.length} benzersiz e-posta`);
  log(`  Sipariş vermiş: ${withOrders} · üye olup hiç sipariş vermemiş: ${membersNoOrder} · yalnız misafir siparişi: ${guestOnly}`);
  if (existingNew !== null) log(`  Yeni sitede ZATEN kayıtlı olan: ${existingNew}`);
  log(`  Siparişte e-posta yok: ${noEmail} · geçersiz e-posta: ${badEmail} · telefonu 05xx biçimine uymayan sipariş: ${badPhone}`);
  log("");
  log(`SİPARİŞLER: ${orders.length} · ${String(first).slice(0, 10)} → ${String(last).slice(0, 10)} · misafir siparişi ${guestOrders}`);
  log(`  Durum: ${top(status, 20).map(([k, n]) => `${k} ${n} (${money(statusRevenue.get(k))})`).join(" · ")}`);
  log(`  Yıllara göre (adet / ciro, iptal-başarısız hariç): ${[...byYear.keys()].sort().map((y) => `${y}: ${byYear.get(y)} / ${money(yearRevenue.get(y))}`).join(" · ")}`);
  log(`  Para birimi: ${top(currency).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  log(`  Oluşturulma kaynağı: ${top(createdVia).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
  log(`    (checkout = siteden; admin = elle; rest-api / başka = entegrasyon — pazaryeri siparişi olabilir!)`);
  log(`  Ödeme: ${top(payment, 10).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
  log(`  Kargo: ${top(shipping, 10).map(([k, n]) => `${k} ${n}`).join(" · ") || "—"}`);
  log(`  İadeli sipariş ${refundOrders} (toplam ${money(refundTotal)}) · kuponlu ${couponOrders} · ek ücretli ${feeOrders} · müşteri notlu ${noteOrders}`);
  log(`  Sipariş no ≠ kayıt no: ${numberDiffers} (sıralı numara eklentisi var demek)`);
  log(`  Sipariş ek alanları (ilk 15): ${top(orderMeta).map(([k, n]) => `${k}(${n})`).join(", ") || "—"}`);
  log(`  Satır ek alanları (ilk 10): ${top(itemMeta, 10).map(([k, n]) => `${k}(${n})`).join(", ") || "—"}`);
  log("");
  log(`ADRES: ${addrTotal} adresli sipariş · il bulundu ${pct(cityOk, addrTotal)} · ilçe de bulundu ${pct(districtOk, addrTotal)}`);
  log("");
  if (ns) {
    log(`ÜRÜN EŞLEŞTİRME (${items} satır, yeni sitede ${ns.variantCount} varyant):`);
    log(`  SKU ile ${mSku} (${pct(mSku, items)}) · barkod ile ${mBarcode} (${pct(mBarcode, items)}) · eşleşmeyen ${mNone} (${pct(mNone, items)})`);
    log(`  Eski sitede artık olmayan ürün satırı: ${deletedProduct}`);
    log(`  Eşleşmeyen farklı ürün: ${unmatched.size} → .woo-report/${site.code}-eslesmeyen.csv`);
    log(`  En çok satılan eşleşmeyenler: ${[...unmatched.values()].sort((a, b) => b.qty - a.qty).slice(0, 8).map((u) => `${u.name} [${u.sku || u.barcode || "kodsuz"}] ${u.qty} adet`).join(" · ")}`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  writeFileSync(new URL(`${site.code}-eslesmeyen.csv`, OUT_DIR),
    "﻿Ürün;SKU;Barkod;Adet;Sipariş\n" + [...unmatched.values()].sort((a, b) => b.qty - a.qty)
      .map((u) => [u.name, u.sku, u.barcode, u.qty, u.orders].map(esc).join(";")).join("\n"));

  return { lines: L, emails: new Set(emailList.map(([e]) => e)) };
}

async function main() {
  console.log("== WooCommerce KEŞİF (salt okunur; hiçbir şey yazılmaz) ==");
  const missing = SITES.filter((s) => !s.url || !s.key || !s.secret);
  for (const s of missing) console.log(`! ${s.label}: WOO_${s.code.toUpperCase()}_URL / _KEY / _SECRET eksik → atlanıyor.`);
  const ready = SITES.filter((s) => !missing.includes(s));
  if (!ready.length) { console.error("HATA: .env.woo içinde hiçbir site tanımlı değil."); process.exit(1); }

  const ns = await loadNewSystem().catch((e) => { console.log(`! Yeni sistem okunamadı: ${e.message}`); return null; });
  const results = [];
  for (const s of ready) {
    try { results.push({ site: s, ...(await discover(s, ns)) }); }
    catch (e) { results.push({ site: s, lines: [`HATA: ${e.message}`], emails: new Set() }); }
  }

  const report = [];
  for (const r of results) report.push("", `═══ ${r.site.label} ═══`, ...r.lines);
  if (results.length > 1) {
    const [a, b] = results;
    const both = [...a.emails].filter((e) => b.emails.has(e)).length;
    report.push("", "═══ İKİ SİTE BİRLİKTE ═══", `Her iki sitede de olan müşteri: ${both} · toplam tekil müşteri: ${a.emails.size + b.emails.size - both}`);
  }
  const text = report.join("\n");
  console.log(text);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(new URL("rapor.txt", OUT_DIR), text.trimStart() + "\n");
  console.log("\nRapor: .woo-report/rapor.txt (kişisel veri içermez; bana yapıştırabilirsin)");
}

main().catch((e) => { console.error("HATA:", e.message); process.exit(1); });
