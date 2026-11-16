// ZAMANLANMIŞ İŞLER (CRON) — TOPLU ŞİFRE DENETİMİ (güvenlik taraması 2026-11-16, 4. parça).
// Duman testi 6 cron ucundan yalnız 3'ünü deniyordu; yeni bir cron ucunda şifre satırı unutulursa hiçbir şey
// yakalamıyordu. Burada iki yoldan denetlenir:
//   1) KOD: src/app/api/cron altındaki her route.ts'te dışa açılan her işlev (GET / POST, `export const GET = run` dahil)
//      CRON_SECRET'ı x-cron-secret başlığından kontrol ediyor mu, şifre tanımsızken de reddediyor mu (`if (!secret || …)`)
//      ve bu kontrol veritabanına yazan / dışarıya istek atan ilk satırdan ÖNCE mi. Yoksa HATA.
//   2) İSTEK: her cron ucu her işleviyle şifresiz ve yanlış şifreyle çağrılır → 401 dışında bir cevap HATA.
// Hiçbir veriyi değiştirmez: istekler şifresiz olduğu için iş çalışmadan döner. Kod denetiminden geçemeyen uç
// çağrılmaz (şifresi yoksa çağrı işi gerçekten çalıştırırdı).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, sep } from "node:path";

const CRON_DIR = fileURLToPath(new URL("../../src/app/api/cron/", import.meta.url));
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const SECRET_CHECK = /if\s*\(\s*!secret\s*\|\|/;                       // şifre tanımsızsa da reddet
const WORK = /\.(insert|update|upsert|delete|rpc)\s*\(|\bfetch\s*\(|createAdminClient\s*\(/; // kontrolden önce gelmemeli

function routeFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...routeFiles(p));
    else if (name === "route.ts") out.push(p);
  }
  return out.sort();
}

// Üst düzey bildirimlere böl (06-admin-yetki.mjs ile aynı yaklaşım)
function chunks(src) {
  const out = [];
  let cur = null;
  for (const line of src.split("\n")) {
    if (/^(export |async function |function |const |let |type |import )/.test(line)) {
      const fn = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/.exec(line);
      const alias = /^export\s+const\s+(\w+)\s*=\s*([A-Za-z_]\w*)\s*;?\s*(\/\/.*)?$/.exec(line);
      cur = { name: fn?.[1] ?? alias?.[1] ?? null, alias: alias?.[2] ?? null, exported: line.startsWith("export"), text: line + "\n" };
      out.push(cur);
    } else if (cur) cur.text += line + "\n";
  }
  return out;
}

/** Bir cron route.ts kaynağını denetler: dışa açılan işlevler + her birinde sorun (boşsa sorun yok). */
export function auditCronSource(src) {
  const cs = chunks(src);
  const byName = new Map(cs.filter((c) => c.name).map((c) => [c.name, c]));
  const handlers = cs.filter((c) => c.exported && METHODS.includes(c.name));
  const problems = [];
  if (!handlers.length) problems.push("dışa açılan GET / POST … işlevi bulunamadı (denetim dosyayı okuyamadı)");
  for (const h of handlers) {
    const body = h.alias ? byName.get(h.alias)?.text ?? "" : h.text;
    const check = body.search(SECRET_CHECK);
    if (check < 0 || !/process\.env\.CRON_SECRET/.test(body) || !/["']x-cron-secret["']/.test(body)) {
      problems.push(`${h.name}: CRON_SECRET kontrolü yok (x-cron-secret başlığı + şifre tanımsızken red)`);
      continue;
    }
    const work = body.search(WORK);
    if (work >= 0 && work < check) problems.push(`${h.name}: iş (veritabanı / dış istek) şifre kontrolünden önce`);
  }
  return { methods: handlers.map((h) => h.name), problems };
}

export default {
  name: "Zamanlanmış işler (cron): şifre",
  async run(t) {
    const { add, part, api } = t;
    const files = routeFiles(CRON_DIR).map((f) => {
      const rel = relative(CRON_DIR, f).split(sep).slice(0, -1);
      return { path: "/api/cron/" + rel.join("/"), label: "src/app/api/cron/" + [...rel, "route.ts"].join("/"), ...auditCronSource(readFileSync(f, "utf8")) };
    });

    await part("Cron: her uçta şifre kontrolü (kod)", async () => {
      // Denetimin kendisi çalışıyor mu: şifresiz / şifre tanımsızken açık / işten sonra kontrol eden örnek yakalanmalı
      const none = auditCronSource(`export async function POST(req) {\n  const sb = createAdminClient();\n  await sb.rpc("x");\n}\n`);
      const open = auditCronSource(`export async function POST(req) {\n  const secret = process.env.CRON_SECRET;\n  if (secret && req.headers.get("x-cron-secret") !== secret) return no;\n}\n`);
      const late = auditCronSource(`async function run(req) {\n  await createAdminClient().rpc("x");\n  const secret = process.env.CRON_SECRET;\n  if (!secret || req.headers.get("x-cron-secret") !== secret) return no;\n}\nexport const GET = run;\n`);
      const good = auditCronSource(`async function run(req) {\n  const secret = process.env.CRON_SECRET;\n  const provided = req.headers.get("x-cron-secret");\n  if (!secret || provided !== secret) return no;\n  await createAdminClient().rpc("x");\n}\nexport const POST = run;\nexport const GET = run; // kolaylık\n`);
      add(none.problems.length === 1 && open.problems.length === 1 && late.problems.length === 1 && good.problems.length === 0 && good.methods.join() === "POST,GET" ? "ok" : "fail",
        "Cron denetimi kendini doğruluyor (şifresiz / tanımsızken açık / geç kontrollü örnek yakalanıyor)", JSON.stringify({ none: none.problems, open: open.problems, late: late.problems, good }));
      add(files.length >= 6 ? "ok" : "fail", `Cron uçları bulundu (${files.length})`, `beklenen en az 6 — klasör okunamadı mı? ${CRON_DIR}`);
      for (const r of files) r.problems.length ? add("fail", `${r.label}: şifre kontrolü eksik`, r.problems.join("; ")) : add("ok", r.label);
    });

    await part("Cron: şifresiz ve yanlış şifreyle çağrılınca 401", async () => {
      for (const r of files) {
        if (r.problems.length) { add("fail", `${r.path}: kod denetiminden geçmediği için çağrılmadı`, "şifresi olmayan uç çağrılırsa iş gerçekten çalışır — önce şifre kontrolünü ekle"); continue; }
        for (const m of r.methods) {
          const opts = { method: m, ...(m === "GET" ? {} : { body: {} }) };
          const none = await api(r.path, opts);
          const wrong = await api(r.path, { ...opts, headers: { "x-cron-secret": "yanlis-regresyon" } });
          add(none.status === 401 && wrong.status === 401 ? "ok" : "fail", `${m} ${r.path}: şifresiz ve yanlış şifreyle reddediliyor`,
            `şifresiz HTTP ${none.status}, yanlış şifre HTTP ${wrong.status} (401 olmalı) — ${r.label}`);
        }
      }
    });
  },
};
