// WooCommerce aktarım betiklerinin ortak yardımcıları (woo-import.mjs).
// .env.woo (anahtarlar) + uygulama .env'lerini okur; WooCommerce REST istemcisi;
// Türkiye il/ilçe çözümleme (WooCommerce il kodu TR01…TR81 = plaka sırası).

import { readFileSync } from "node:fs";

export function loadEnv() {
  for (const name of [".env.woo", ".env.local", ".env", ".env.production.local", ".env.production"]) {
    try {
      for (const line of readFileSync(new URL(`../../${name}`, import.meta.url), "utf8").split("\n")) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch { /* bu dosya yoksa geç */ }
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const lower = (v) => String(v ?? "").trim().toLowerCase();
export const normSku = (v) => String(v ?? "").toUpperCase().replace(/\s+/g, "") || null;
export const round2 = (v) => Math.round(Number(v || 0) * 100) / 100;
export const BARCODE_KEY = /barcode|barkod|gtin|ean|upc|isbn/i;
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function phone10(p) {
  let d = String(p ?? "").replace(/\D/g, "");
  if (d.startsWith("90") && d.length === 12) d = d.slice(2);
  if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  return d.length === 10 ? d : null;
}

const trFold = (v) => String(v ?? "").toLocaleLowerCase("tr-TR")
  .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
  .replace(/[^a-z0-9]/g, "");

function loadGeo() {
  const src = readFileSync(new URL("../../src/lib/turkey-geo.ts", import.meta.url), "utf8");
  const cities = JSON.parse(src.match(/CITIES: string\[\] = (\[[\s\S]*?\]);/)[1].replace(/,\s*\]/, "]"));
  const districts = {};
  for (const m of src.matchAll(/^\s*"([^"]+)": (\[[^\]]*\]),?\r?$/gm)) districts[m[1]] = JSON.parse(m[2]);
  return { cities, districts };
}
const GEO = loadGeo();
const PLATE = ["Adana","Adıyaman","Afyonkarahisar","Ağrı","Amasya","Ankara","Antalya","Artvin","Aydın","Balıkesir","Bilecik","Bingöl","Bitlis","Bolu","Burdur","Bursa","Çanakkale","Çankırı","Çorum","Denizli","Diyarbakır","Edirne","Elazığ","Erzincan","Erzurum","Eskişehir","Gaziantep","Giresun","Gümüşhane","Hakkari","Hatay","Isparta","Mersin","İstanbul","İzmir","Kars","Kastamonu","Kayseri","Kırklareli","Kırşehir","Kocaeli","Konya","Kütahya","Malatya","Manisa","Kahramanmaraş","Mardin","Muğla","Muş","Nevşehir","Niğde","Ordu","Rize","Sakarya","Samsun","Siirt","Sinop","Sivas","Tekirdağ","Tokat","Trabzon","Tunceli","Şanlıurfa","Uşak","Van","Yozgat","Zonguldak","Aksaray","Bayburt","Karaman","Kırıkkale","Batman","Şırnak","Bartın","Ardahan","Iğdır","Yalova","Karabük","Kilis","Osmaniye","Düzce"];
const CITY_BY_FOLD = new Map(GEO.cities.map((c) => [trFold(c), c]));

export function resolveCity(state, cityText) {
  const m = /^TR(\d{2})$/.exec(String(state || "").trim().toUpperCase());
  if (m) return PLATE[Number(m[1]) - 1] || null;
  return CITY_BY_FOLD.get(trFold(state)) || CITY_BY_FOLD.get(trFold(cityText)) || null;
}

export function resolveDistrict(city, text) {
  if (!city) return null;
  const list = GEO.districts[city] || [];
  const f = trFold(text);
  if (!f) return null;
  return list.find((d) => trFold(d) === f) || list.find((d) => f.includes(trFold(d)) && trFold(d).length >= 4) || null;
}

/** WooCommerce adresi → yeni sistemin adres alanları (il/ilçe listeyle eşlenir, eşleşmezse metin kalır). */
export function mapAddress(a) {
  if (!a || !(a.address_1 || a.city || a.state)) return null;
  const city = resolveCity(a.state, a.city);
  const district = resolveDistrict(city, a.city) || resolveDistrict(city, a.address_2) || String(a.city || "").trim();
  return {
    first_name: String(a.first_name || "").trim(),
    last_name: String(a.last_name || "").trim(),
    phone: phone10(a.phone) || "",
    address_detail: [a.address_1, a.address_2].map((x) => String(x || "").trim()).filter(Boolean).join(" "),
    district,
    city: city || String(a.state || "").trim(),
    company: String(a.company || "").trim(),
    cityResolved: !!city,
  };
}

export function wooClient(site) {
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
