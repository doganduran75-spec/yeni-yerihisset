// YÖNETİM PANELİ API'LERİ — TOPLU YETKİ DENETİMİ (güvenlik taraması 2026-11-16, 2. parça).
// Yetki kontrolü merkezî değil: her admin rotası kendi başında "giriş var mı + rol admin mi" bakıyor. Yeni bir rota
// eklenip bu satır unutulursa hiçbir şey yakalamıyordu. Burada iki yoldan denetlenir:
//   1) KOD: src/app/api/admin altındaki her route.ts'te, dışa açılan her işlev (GET / POST / …) yetki kontrolü yapıyor
//      mu (satır içinde ya da aynı dosyadaki requireAdmin benzeri yardımcıyla) ve bu kontrol veritabanına yazan ilk
//      satırdan ÖNCE mi. Yoksa HATA.
//   2) İSTEK: her admin rotası, her işleviyle girişsiz ve sıradan üye olarak çağrılır → 401 / 403 dışında bir cevap HATA.
// Hiçbir veriyi değiştirmez: istekler yetkisiz olduğu için rota hiçbir işlem yapmadan döner (boş gövde {} gönderilir).
// Tek iz: sıradan üye için geçici "rgt-yetki-…@yerihisset.test" hesabı açılır ve bölüm sonunda silinir.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join, relative, sep } from "node:path";

const DOMAIN = "yerihisset.test";
const ADMIN_DIR = fileURLToPath(new URL("../../src/app/api/admin/", import.meta.url));
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
// Yetki kontrolünün kanıtı: rolün "admin" olmadığında geri çevirme (ya da veritabanındaki is_admin())
const ADMIN_CHECK = /role\s*!==\s*["']admin["']|\bis_admin\s*\(/;
// Veritabanına yazan / iş yapan çağrı — yetki kontrolünden önce gelmemeli
const WRITE = /\.(insert|update|upsert|delete|rpc)\s*\(/;
// Dinamik klasörlere ([channel]) istekte konacak geçerli değer (geçersiz değer yetkiden önce 404 döndürebilir)
const PARAMS = { channel: "trendyol" };

function routeFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...routeFiles(p));
    else if (name === "route.ts") out.push(p);
  }
  return out.sort();
}

// Dosyayı üst düzey bildirimlere böl (sütun 0'da başlayan export / function / const …). Yaklaşık ama bu dosyaların
// yazım biçimi için yeterli: işlev gövdeleri girintili, yardımcılar dosyanın üst düzeyinde.
function chunks(src) {
  const out = [];
  let cur = null;
  for (const line of src.split("\n")) {
    if (/^(export |async function |function |const |let |type |import )/.test(line)) {
      const fn = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/.exec(line);
      const alias = /^export\s+const\s+(\w+)\s*=\s*([A-Za-z_]\w*)\s*;?\s*$/.exec(line);
      cur = { name: fn?.[1] ?? alias?.[1] ?? null, alias: alias?.[2] ?? null, exported: line.startsWith("export"), text: line + "\n" };
      out.push(cur);
    } else if (cur) cur.text += line + "\n";
  }
  return out;
}

/** Bir route.ts kaynağını denetler: dışa açılan işlevler + her birinde sorun (boşsa sorun yok). */
export function auditRouteSource(src) {
  const cs = chunks(src);
  const byName = new Map(cs.filter((c) => c.name).map((c) => [c.name, c]));
  // Yetki yardımcıları: dışa açılmayan, kullanıcıyı okuyup rolü kontrol eden işlev
  const helpers = cs.filter((c) => !c.exported && c.name && ADMIN_CHECK.test(c.text) && /getAuthUserFromRequest\s*\(/.test(c.text)).map((c) => c.name);
  const handlers = cs.filter((c) => c.exported && METHODS.includes(c.name));
  const problems = [];
  if (!handlers.length) problems.push("dışa açılan GET / POST … işlevi bulunamadı (denetim dosyayı okuyamadı)");
  for (const h of handlers) {
    const body = h.alias ? byName.get(h.alias)?.text ?? "" : h.text;
    const marks = [];
    const inline = body.search(ADMIN_CHECK);
    if (inline >= 0 && /getAuthUserFromRequest\s*\(/.test(body)) marks.push(inline);
    for (const name of helpers) {
      const i = body.search(new RegExp(`\\b${name}\\s*\\(`));
      if (i >= 0) marks.push(i);
    }
    if (!marks.length) { problems.push(`${h.name}: yetki kontrolü yok (giriş + rol admin mi)`); continue; }
    const check = Math.min(...marks);
    const write = body.search(WRITE);
    if (write >= 0 && write < check) problems.push(`${h.name}: veritabanına yazan satır yetki kontrolünden önce`);
  }
  return { methods: handlers.map((h) => h.name), problems };
}

export default {
  name: "Yönetim paneli API'leri: yetki",
  async run(t) {
    const { sql, lit, add, part, api, auth } = t;
    const files = routeFiles(ADMIN_DIR).map((f) => {
      const rel = relative(ADMIN_DIR, f).split(sep).slice(0, -1); // [..., "route.ts"] → klasörler
      const path = "/api/admin/" + rel.map((s) => s.replace(/^\[(\w+)\]$/, (_, k) => PARAMS[k] ?? "x")).join("/");
      const label = "src/app/api/admin/" + [...rel, "route.ts"].join("/");
      return { file: f, path, label, dyn: rel.filter((s) => /^\[\w+\]$/.test(s) && !(s.slice(1, -1) in PARAMS)), ...auditRouteSource(readFileSync(f, "utf8")) };
    });

    await part("Admin API: her rotada yetki kontrolü (kod)", async () => {
      // Denetimin kendisi çalışıyor mu: kontrolsüz örnek yakalanmalı, doğru örnek geçmeli
      const bad = auditRouteSource(`import x from "y";\nexport async function POST(req) {\n  const sb = createAdminClient();\n  await sb.from("orders").delete().eq("id", 1);\n}\n`);
      const late = auditRouteSource(`export async function POST(req) {\n  await sb.from("orders").update({ a: 1 });\n  const user = await getAuthUserFromRequest(req);\n  if (me?.role !== "admin") return no;\n}\n`);
      const good = auditRouteSource(`async function requireAdmin(req) {\n  const user = await getAuthUserFromRequest(req);\n  if (me?.role !== "admin") return { error: 1 };\n}\nexport async function GET(req) {\n  const a = await requireAdmin(req);\n  await sb.from("x").update({});\n}\nexport const POST = GET;\n`);
      add(bad.problems.length === 1 && late.problems.length === 1 && good.problems.length === 0 && good.methods.join() === "GET,POST" ? "ok" : "fail",
        "Yetki denetimi kendini doğruluyor (kontrolsüz / geç kontrollü örnek yakalanıyor)", JSON.stringify({ bad: bad.problems, late: late.problems, good }));
      add(files.length >= 30 ? "ok" : "fail", `Admin rotaları bulundu (${files.length})`, `beklenen en az 30 — klasör okunamadı mı? ${ADMIN_DIR}`);
      for (const r of files) {
        r.problems.length ? add("fail", `${r.label}: yetki kontrolü eksik`, r.problems.join("; ")) : add("ok", r.label);
        if (r.dyn.length) add("fail", `${r.label}: dinamik klasör için deneme değeri yok`, `${r.dyn.join(", ")} → 06-admin-yetki.mjs PARAMS'a ekle`);
      }
    });

    await part("Admin API: girişsiz ve üye olarak çağrılınca 401 / 403", async () => {
      // Sıradan üye (rolü admin değil). Önceki yarım kalan çalıştırmanın hesabı da temizlenir.
      const RUN = Date.now().toString(36);
      const email = `rgt-yetki-${RUN}@${DOMAIN}`;
      const password = randomBytes(18).toString("base64url");
      const drop = (where) => sql(`DELETE FROM public.profiles WHERE id IN (SELECT id FROM auth.users WHERE ${where}); DELETE FROM auth.users WHERE ${where};`);
      let member = null;
      try {
        drop(`email ILIKE 'rgt-yetki-%@${DOMAIN}'`);
        const c = await auth("admin/users", { method: "POST", service: true, body: { email, password, email_confirm: true, user_metadata: { first_name: "Regresyon", last_name: "yetki" } } });
        if (!c.json?.id) throw new Error(`HTTP ${c.status}`);
        sql(`INSERT INTO public.profiles (id, email, first_name, last_name) VALUES (${lit(c.json.id)}, ${lit(email)}, 'Regresyon', 'yetki')
             ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`);
        const s = await auth("token?grant_type=password", { method: "POST", body: { email, password } });
        if (!s.json?.access_token) throw new Error(`giriş HTTP ${s.status}`);
        member = { id: c.json.id, token: s.json.access_token };
        const role = sql(`SELECT coalesce(role, '') FROM public.profiles WHERE id = ${lit(member.id)}`)[0]?.[0];
        if (role === "admin") throw new Error("test üyesinin rolü admin — deneme anlamsız");
      } catch (e) {
        add("fail", "Sıradan üye hesabı açılamadı (üye denemesi yapılamadı)", String(e?.message || e).split("\n")[0]);
      }

      try {
        for (const r of files) {
          for (const m of r.methods) {
            const opts = { method: m, ...(m === "GET" ? {} : { body: {} }) };
            const anon = await api(r.path, opts);
            const asMember = member ? await api(r.path, { ...opts, token: member.token }) : null;
            const okAnon = anon.status === 401 || anon.status === 403;
            const okMember = !asMember || asMember.status === 401 || asMember.status === 403;
            add(okAnon && okMember ? "ok" : "fail", `${m} ${r.path}: girişsiz ve üye geri çevriliyor`,
              `girişsiz HTTP ${anon.status}${asMember ? `, üye HTTP ${asMember.status}` : ""} (401 / 403 olmalı) — ${r.label}`);
          }
        }
      } finally {
        if (member) drop(`id = ${lit(member.id)}`);
      }
    });
  },
};
