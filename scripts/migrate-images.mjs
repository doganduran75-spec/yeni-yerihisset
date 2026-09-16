#!/usr/bin/env node
// Ürün görsellerini ESKİ bulut Supabase'inden SELF-HOST Supabase'e taşır.
// Her görseli public URL'den indirir, self-host storage'a AYNI yola yükler
// (upsert), sonra DB'deki URL'leri self-host domaine günceller. Idempotent:
// tekrar çalıştırınca zaten taşınmışları atlar. Yalnızca eski-bulut URL'lerine
// dokunur (unsplash/placeholder ve zaten self-host olanları es geçer).
//
// Kullanım:
//   node scripts/migrate-images.mjs           # DRY-RUN (hiçbir şey yazmaz, rapor)
//   node scripts/migrate-images.mjs --apply   # gerçekten taşı + DB güncelle
//
// Gerekli env (.env.local'de var): NEXT_PUBLIC_SUPABASE_URL (self-host),
//   SUPABASE_SERVICE_ROLE_KEY. (Eski bulut görselleri public olduğundan eski
//   anahtar gerekmez.)

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// .env.local'i basitçe yükle (Next dışında çalıştığımız için)
try {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* env dosyası yoksa gerçek ortam değişkenlerine güven */ }

const OLD_HOST = "ewnuurgmxhksbjixbian.supabase.co";
const APPLY = process.argv.includes("--apply");

const SELF_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SELF_URL || !SERVICE) { console.error("HATA: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY gerekli."); process.exit(1); }
if (SELF_URL.includes(OLD_HOST)) { console.error("HATA: NEXT_PUBLIC_SUPABASE_URL hâlâ eski buluta işaret ediyor; önce self-host'a çevir."); process.exit(1); }

const SELF_BASE = SELF_URL.replace(/\/$/, "");
const OLD_BASE = `https://${OLD_HOST}`;
const sb = createClient(SELF_URL, SERVICE, { auth: { persistSession: false } });

function ctype(path) {
  const e = (path.split(".").pop() || "").toLowerCase();
  return e === "png" ? "image/png" : e === "webp" ? "image/webp" : e === "avif" ? "image/avif"
    : e === "gif" ? "image/gif" : "image/jpeg";
}
function parseOld(url) {
  const tail = url.split("/storage/v1/object/public/")[1];
  if (!tail) return null;
  const [bucket, ...rest] = tail.split("/");
  return { bucket, objectPath: rest.join("/") };
}

const migrated = new Set(); // başarıyla self-host'a taşınan tam URL'ler
const failed = new Set();
const buckets = new Set();

async function ensureBucket(bucket) {
  if (!APPLY || buckets.has(bucket)) return;
  const { data } = await sb.storage.getBucket(bucket);
  if (!data) await sb.storage.createBucket(bucket, { public: true });
  else if (!data.public) console.warn(`  ⚠ '${bucket}' bucket'ı public değil — public URL'ler 403 olabilir.`);
  buckets.add(bucket);
}

async function migrateUrl(url) {
  if (!url || !url.includes(OLD_HOST) || migrated.has(url) || failed.has(url)) return migrated.has(url);
  const p = parseOld(url);
  if (!p) { failed.add(url); return false; }
  if (!APPLY) { migrated.add(url); return true; } // dry-run: sadece say
  try {
    await ensureBucket(p.bucket);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`indirme ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const { error } = await sb.storage.from(p.bucket).upload(p.objectPath, buf, { upsert: true, contentType: ctype(p.objectPath) });
    if (error) throw error;
    migrated.add(url);
    return true;
  } catch (e) {
    console.warn("  ✗ taşınamadı:", url, "—", e.message);
    failed.add(url);
    return false;
  }
}
const rewrite = (url) => (url && url.includes(OLD_HOST) && migrated.has(url)) ? url.replace(OLD_BASE, SELF_BASE) : url;

async function main() {
  console.log(APPLY ? "== GÖRSEL TAŞIMA (apply) ==" : "== DRY-RUN (rapor; hiçbir şey yazılmaz) ==");
  console.log(`Kaynak: ${OLD_BASE}  →  Hedef: ${SELF_BASE}\n`);

  let oldUrlCount = 0, pUpdates = 0, vUpdates = 0;

  const { data: products, error: pErr } = await sb.from("products").select("id, images, image_url");
  if (pErr) throw pErr;
  for (const p of products || []) {
    const imgs = Array.isArray(p.images) ? p.images : [];
    for (const u of imgs) if (u && u.includes(OLD_HOST)) { oldUrlCount++; await migrateUrl(u); }
    if (p.image_url && p.image_url.includes(OLD_HOST)) { oldUrlCount++; await migrateUrl(p.image_url); }
    const newImgs = imgs.map(rewrite);
    const newImageUrl = rewrite(p.image_url);
    if (JSON.stringify(newImgs) !== JSON.stringify(imgs) || newImageUrl !== p.image_url) {
      pUpdates++;
      if (APPLY) {
        const { error } = await sb.from("products").update({ images: newImgs, image_url: newImageUrl }).eq("id", p.id);
        if (error) console.warn("  ✗ ürün güncellenemedi", p.id, error.message);
      }
    }
  }

  const { data: variants, error: vErr } = await sb.from("product_variants").select("id, image_url");
  if (vErr) throw vErr;
  for (const v of variants || []) {
    if (v.image_url && v.image_url.includes(OLD_HOST)) {
      oldUrlCount++; await migrateUrl(v.image_url);
      const nu = rewrite(v.image_url);
      if (nu !== v.image_url) {
        vUpdates++;
        if (APPLY) {
          const { error } = await sb.from("product_variants").update({ image_url: nu }).eq("id", v.id);
          if (error) console.warn("  ✗ varyant güncellenemedi", v.id, error.message);
        }
      }
    }
  }

  console.log(`\nEski-bulut görsel URL: ${oldUrlCount}`);
  console.log(`${APPLY ? "Taşınan" : "Taşınacak"}: ${migrated.size} | Başarısız: ${failed.size}`);
  console.log(`${APPLY ? "Güncellenen" : "Güncellenecek"} → ürün: ${pUpdates}, varyant: ${vUpdates}`);
  if (!APPLY) console.log("\nDRY-RUN bitti. Gerçek taşıma için:  node scripts/migrate-images.mjs --apply");
  else console.log("\nTAŞIMA tamam. Artık görseller self-host Supabase'ten servis edilir.");
}
main().catch((e) => { console.error(e); process.exit(1); });
