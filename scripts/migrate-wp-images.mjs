#!/usr/bin/env node
// Eski WordPress sitesinden (yerihisset.com/wp-content/uploads/...) içeriğe
// gömülü kalmış görselleri SELF-HOST Supabase storage'a ('site' bucket'ı,
// kb/wp/... yolu) taşır ve metinlerdeki adresleri yenisiyle değiştirir.
// Neden: yeni site yayına girince yerihisset.com artık WordPress olmayacak →
// bu adresler 404 olur; ayrıca next/image ve CSP bu alan adına izin vermez.
// Idempotent: tekrar çalıştırınca taşınmış olanları (artık wp-content içermez) atlar.
//
// Kullanım (sunucuda, /opt/yerihisset-app içinde):
//   node scripts/migrate-wp-images.mjs           # DRY-RUN (rapor; hiçbir şey yazmaz)
//   node scripts/migrate-wp-images.mjs --apply   # gerçekten taşı + metinleri güncelle

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

for (const name of [".env.local", ".env", ".env.production.local", ".env.production"]) {
  try {
    for (const line of readFileSync(new URL(`../${name}`, import.meta.url), "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* bu dosya yoksa geç */ }
}

const APPLY = process.argv.includes("--apply");
const SELF_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SELF_URL || !SERVICE) { console.error("HATA: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY gerekli."); process.exit(1); }
const sb = createClient(SELF_URL, SERVICE, { auth: { persistSession: false } });
const BUCKET = "site";

// Taranacak metin kolonları (tablo yoksa/kolon yoksa uyarı verip geçer)
const TARGETS = [
  ["kb_articles", ["content"]],
  ["products", ["description", "short_description"]],
  ["popup_config", ["content"]],
  ["email_templates", ["body_html"]],
  ["email_campaigns", ["html_body"]],
];

const WP_RE = /https?:\/\/(?:www\.)?yerihisset\.com\/wp-content\/uploads\/[^"'\s)<>]+/gi;

const done = new Map();   // eski URL → yeni URL
const skipped = new Map(); // eski URL → sebep

function storagePath(oldUrl) {
  const tail = oldUrl.split("/wp-content/uploads/")[1] || "";
  let p;
  try { p = decodeURIComponent(tail); } catch { p = tail; }
  p = p.split("?")[0].replace(/[^A-Za-z0-9._/-]+/g, "-").replace(/\/+/g, "/");
  return `kb/wp/${p}`;
}

async function migrate(oldUrl) {
  if (done.has(oldUrl) || skipped.has(oldUrl)) return;
  const path = storagePath(oldUrl);
  const newUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  try {
    const res = await fetch(oldUrl.replace(/^http:/, "https:"), { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`indirme ${res.status}`);
    const type = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (!type.startsWith("image/")) { skipped.set(oldUrl, `görsel değil (${type || "?"})`); return; }
    const buf = Buffer.from(await res.arrayBuffer());
    if (APPLY) {
      const { error } = await sb.storage.from(BUCKET).upload(path, buf, { upsert: true, contentType: type });
      if (error) throw new Error(error.message);
    }
    done.set(oldUrl, newUrl);
    console.log(`  ${APPLY ? "✓" : "→"} ${oldUrl}\n      ${newUrl} (${Math.round(buf.length / 1024)} KB)`);
  } catch (e) {
    skipped.set(oldUrl, e.message);
  }
}

async function main() {
  console.log(APPLY ? "== WP GÖRSEL TAŞIMA (apply) ==" : "== DRY-RUN (rapor; hiçbir şey yazılmaz) ==");
  if (APPLY) {
    const { data } = await sb.storage.getBucket(BUCKET);
    if (!data) { console.error(`HATA: '${BUCKET}' bucket'ı yok.`); process.exit(1); }
  }

  let rowUpdates = 0;
  for (const [table, cols] of TARGETS) {
    const { data: rows, error } = await sb.from(table).select(["id", ...cols].join(", "));
    if (error) { console.warn(`(atlandı) ${table}: ${error.message}`); continue; }
    for (const row of rows || []) {
      const patch = {};
      for (const c of cols) {
        const text = row[c];
        if (typeof text !== "string" || !WP_RE.test(text)) continue;
        WP_RE.lastIndex = 0;
        const urls = [...new Set(text.match(WP_RE))];
        for (const u of urls) await migrate(u);
        let next = text;
        for (const u of urls) if (done.has(u)) next = next.split(u).join(done.get(u));
        if (next !== text) patch[c] = next;
      }
      if (Object.keys(patch).length) {
        rowUpdates++;
        console.log(`  ${table} #${row.id}: ${Object.keys(patch).join(", ")} güncellen${APPLY ? "di" : "ecek"}`);
        if (APPLY) {
          const { error: uErr } = await sb.from(table).update(patch).eq("id", row.id);
          if (uErr) console.warn(`  ✗ ${table} #${row.id} güncellenemedi: ${uErr.message}`);
        }
      }
    }
  }

  console.log(`\n${APPLY ? "Taşınan" : "Taşınacak"} görsel: ${done.size} | Atlanan: ${skipped.size} | ${APPLY ? "Güncellenen" : "Güncellenecek"} kayıt: ${rowUpdates}`);
  for (const [u, why] of skipped) console.log(`  ✗ ${u} — ${why}`);
  if (!APPLY) console.log("\nDRY-RUN bitti. Gerçek taşıma için:  node scripts/migrate-wp-images.mjs --apply");
}
main().catch((e) => { console.error(e); process.exit(1); });
