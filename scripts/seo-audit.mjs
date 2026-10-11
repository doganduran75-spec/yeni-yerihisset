#!/usr/bin/env node
// SEO / GEO İÇERİK DENETİMİ — salt okur, hiçbir şeyi değiştirmez. Yapay zekâ ve arama motorlarının
// "alıntılanabilir, özgün, sayısal bilgi" bulup bulamadığını ürün, kategori, marka ve rehber düzeyinde ölçer.
// Ayrıntı ve yorum: docs/SEO-GEO-ANALIZ.md
//
// Kullanım (sunucuda, /opt/yerihisset-app içinde):
//   node scripts/seo-audit.mjs            # özet + en önemli sorunlar
//   node scripts/seo-audit.mjs --hepsi    # her ürün / yazı tek tek
// Çıktının tamamını Claude'a gönder.
import { execFileSync } from "node:child_process";

const DB = process.env.DB_CONTAINER || "supabase-db";
const APP = (process.env.APP_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const ALL = process.argv.includes("--hepsi");

function sql(query) {
  const out = execFileSync("docker", ["exec", "-i", DB, "psql", "-U", "postgres", "-d", "postgres", "-qAt", "-v", "ON_ERROR_STOP=1"],
    { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  return out.trim();
}
const rows = (q) => JSON.parse(sql(`SELECT coalesce(json_agg(x), '[]') FROM (${q}) x`) || "[]");

const text = (h) => String(h || "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
const words = (t) => (t.toLocaleLowerCase("tr-TR").match(/[\p{L}\p{N}]+/gu) || []);
const shingles = (w, n = 5) => { const s = new Set(); for (let i = 0; i + n <= w.length; i++) s.add(w.slice(i, i + n).join(" ")); return s; };
const overlap = (a, b) => { if (!a.size || !b.size) return 0; let k = 0; for (const x of a) if (b.has(x)) k++; return k / Math.min(a.size, b.size); };
const pct = (x) => `${Math.round(x * 100)}%`;
// Yapay zekânın alıntılayacağı somut bilgi: ölçü (mm / gr / cm), yaş, numara–ayak boyu, malzeme yüzdesi
const SPEC = /(\d+([.,]\d+)?\s?(mm|milimetre|gr|gram|g\b|cm|santim|yaş|ay\b|aylık))|(%\s?\d+)|(\d+\s?%)/i;
const FAQ = /(sıkça sorulan|sss|\?\s)/i;

const out = [];
const say = (s = "") => out.push(s);

// ── Ürünler ──
const products = rows(`SELECT p.id, p.title, p.slug, p.description, p.short_description, coalesce(array_length(p.images,1),0) AS imgs,
  b.name AS brand, c.name AS cat,
  (SELECT count(*) FROM public.order_reviews r JOIN public.order_items oi ON oi.order_id = r.order_id WHERE oi.product_id = p.id AND r.is_approved) AS reviews,
  (SELECT count(*) FROM public.product_variants v WHERE v.product_id = p.id AND v.is_active AND coalesce(v.barcode,'') <> '') AS barcodes,
  (SELECT count(*) FROM public.product_variants v WHERE v.product_id = p.id AND v.is_active) AS variants
  FROM public.products p LEFT JOIN public.brands b ON b.id = p.brand_id LEFT JOIN public.categories c ON c.id = p.category_id
  WHERE p.is_active ORDER BY b.name, p.title`);
const P = products.map((p) => {
  const t = text(p.description);
  const w = words(t);
  return { ...p, t, wc: w.length, sh: shingles(w), spec: SPEC.test(t), faq: FAQ.test(t), short: text(p.short_description).length };
});
for (const p of P) {
  let best = 0, with_ = "";
  for (const q of P) if (q !== p) { const o = overlap(p.sh, q.sh); if (o > best) { best = o; with_ = q.title; } }
  p.dup = best; p.dupWith = with_;
}
const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
say(`== SEO / GEO İÇERİK DENETİMİ — ${new Date().toLocaleString("tr-TR")} ==`);
say("");
say(`▸ ÜRÜNLER (${P.length} aktif)`);
say(`  Ortalama açıklama: ${Math.round(avg(P.map((p) => p.wc)))} kelime · kısa açıklaması olan: ${P.filter((p) => p.short > 0).length}/${P.length}`);
say(`  Başka bir ürünle metni %80+ aynı: ${P.filter((p) => p.dup >= 0.8).length}/${P.length} · %50-80: ${P.filter((p) => p.dup >= 0.5 && p.dup < 0.8).length}`);
say(`  Sayısal ölçü içeren (mm, gr, yaş, %…): ${P.filter((p) => p.spec).length}/${P.length} · soru-cevap içeren: ${P.filter((p) => p.faq).length}/${P.length}`);
say(`  150 kelimeden kısa: ${P.filter((p) => p.wc < 150).length} · görseli 3'ten az: ${P.filter((p) => p.imgs < 3).length} · onaylı yorumu olan: ${P.filter((p) => Number(p.reviews) > 0).length}`);
say(`  Barkodu (GTIN) eksik varyantı olan: ${P.filter((p) => Number(p.variants) > Number(p.barcodes)).length}`);
const byBrand = {};
for (const p of P) (byBrand[p.brand || "(markasız)"] ??= []).push(p);
for (const [b, list] of Object.entries(byBrand)) {
  say(`  · ${b}: ${list.length} ürün, ort. ${Math.round(avg(list.map((p) => p.wc)))} kelime, ort. kopya oranı ${pct(avg(list.map((p) => p.dup)))}, ölçü içeren ${list.filter((p) => p.spec).length}`);
}
if (ALL) {
  say("");
  for (const p of P) say(`  - ${p.title} | ${p.wc} kelime | kopya ${pct(p.dup)}${p.dup >= 0.5 ? ` (${p.dupWith})` : ""} | ölçü ${p.spec ? "✓" : "✗"} | SSS ${p.faq ? "✓" : "✗"} | görsel ${p.imgs} | yorum ${p.reviews}`);
}

// ── Kategori / marka ──
const cats = rows(`SELECT c.name, c.slug, (SELECT count(*) FROM public.products p WHERE p.category_id = c.id AND p.is_active) AS n FROM public.categories c ORDER BY n DESC`);
const brands = rows(`SELECT b.name, b.slug, (SELECT count(*) FROM public.products p WHERE p.brand_id = b.id AND p.is_active) AS n FROM public.brands b ORDER BY n DESC`);
say("");
say(`▸ KATEGORİ / MARKA SAYFALARI`);
say(`  Kategoriler: ${cats.filter((c) => Number(c.n) > 0).map((c) => `${c.name} (${c.n})`).join(", ") || "—"}`);
say(`  Markalar: ${brands.filter((c) => Number(c.n) > 0).map((c) => `${c.name} (${c.n})`).join(", ") || "—"}`);
say(`  Tanıtım metni alanı: YOK (kategori ve marka sayfaları yalnız ürün listesi — yapay zekâ için içerik boş)`);

// ── Bilgi bankası ──
const kb = rows(`SELECT a.title, a.slug, a.content, a.updated_at, a.created_at, k.name AS kcat FROM public.kb_articles a LEFT JOIN public.kb_categories k ON k.id = a.category_id ORDER BY a.created_at`);
const K = kb.map((a) => {
  const t = text(a.content);
  return {
    ...a, wc: words(t).length,
    h2: (String(a.content || "").match(/<h[23]|^#{2,3}\s/gim) || []).length,
    prodLinks: (String(a.content || "").match(/\/products\/|\/urun\//g) || []).length,
    oldLinks: (String(a.content || "").match(/yerihisset\.com\/(urun|urun-kategori|magaza)\//g) || []).length,
    sources: (String(a.content || "").match(/(doi\.org|pubmed|ncbi|journal|dergi|çalışma|araştırma)/gi) || []).length,
    spec: SPEC.test(t), age: Math.round((Date.now() - new Date(a.updated_at || a.created_at).getTime()) / 86400000),
  };
});
say("");
say(`▸ BİLGİ BANKASI (${K.length} yazı)`);
say(`  Ortalama: ${Math.round(avg(K.map((a) => a.wc)))} kelime · alt başlıklı: ${K.filter((a) => a.h2 > 0).length} · ürüne bağlantı veren: ${K.filter((a) => a.prodLinks > 0).length}`);
say(`  Kaynak / çalışma anan: ${K.filter((a) => a.sources > 0).length} · sayısal bilgi içeren: ${K.filter((a) => a.spec).length} · 1 yıldır güncellenmemiş: ${K.filter((a) => a.age > 365).length}`);
say(`  Eski site bağlantısı kalan (yerihisset.com/urun/…): ${K.filter((a) => a.oldLinks > 0).length} yazıda ${K.reduce((s, a) => s + a.oldLinks, 0)} bağlantı`);
for (const a of K) if (ALL || a.wc < 300 || a.oldLinks) say(`  - ${a.title} | ${a.wc} kelime | başlık ${a.h2} | ürün bağlantısı ${a.prodLinks} | kaynak ${a.sources} | ${a.age} gün önce${a.oldLinks ? ` | ESKİ BAĞLANTI ${a.oldLinks}` : ""}`);

// ── Yapay zekâ tarayıcısının gördüğü (JavaScript yok) ──
say("");
say(`▸ TARAYICI GÖZÜYLE (JavaScript çalıştırmadan, GPTBot gibi)`);
async function botView(path) {
  try {
    const r = await fetch(APP + path, { headers: { "User-Agent": "Mozilla/5.0 (compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot)" }, signal: AbortSignal.timeout(20000) });
    const h = await r.text();
    const body = text(h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " "));
    const ld = (h.match(/application\/ld\+json/g) || []).length;
    const alts = [...h.matchAll(/<img[^>]*alt="([^"]*)"/g)].map((m) => m[1]);
    const h1 = (h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1];
    say(`  ${path} → HTTP ${r.status} · görünen metin ${words(body).length} kelime · H1: ${h1 ? text(h1).slice(0, 60) : "YOK"} · yapısal veri ${ld} · görsel ${alts.length} (boş alt ${alts.filter((a) => !a.trim()).length})`);
  } catch (e) { say(`  ${path} → okunamadı (${e.message})`); }
}
await botView("/");
await botView("/barefoot-nedir");
await botView("/magaza");
if (cats[0]) await botView(`/kategori/${cats[0].slug}`);
if (brands[0]) await botView(`/marka/${brands[0].slug}`);
if (P[0]) await botView(`/products/${P[0].slug}`);
if (K[0]) await botView(`/bilgi-bankasi/${K[0].slug}`);

console.log(out.join("\n"));
