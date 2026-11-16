// KOD GÜVENLİĞİ — kaynak denetimi (güvenlik taraması 2026-11-16, 1. ve 3. parçadan kalanlar). Salt okur.
// Geri gelmemesi gereken kalıplar:
//   1) İptal formundaki IBAN sahibi adı / sipariş adı yönetici e-postasına temizlenmeden (HTML olarak) giriyordu
//   2) iyzico dönüşü aynı anda iki kez gelirse sipariş iki kez işlenebiliyordu (kontrol + güncelleme ayrıydı)
//   3) Ödeme sayfası adresteki serbest metni (mesaj=) gösteriyordu → sahte bağlantıyla sayfaya yazı konabiliyordu
//   4) Müşteriye dönen cevaplarda veritabanı hata ayrıntısı (error.message / detail) vardı
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, sep } from "node:path";

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));
const rd = (p) => readFileSync(join(SRC, p), "utf8");

function routeFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...routeFiles(p));
    else if (name === "route.ts") out.push(p);
  }
  return out.sort();
}

// Müşteriye dönen JSON'da hata ayrıntısı: { error: x.message } / { detail: … } / error?.message || …
const LEAK = /(?:NextResponse|Response)\.json\(\s*\{[^}]*?(?:\bdetail\s*:|\berror\s*:\s*\(?\s*[\w.]*?(?:err|error|e|Err|Error)\)?\??\.message)/;
// Yalnız yöneticinin çağırdığı (cevabı yöneticiye giden) uçlar — klasör dışında kalanlar
const ADMIN_ONLY = new Set(["api/kargonomi/ship/route.ts", "api/stock-notify/dispatch/route.ts", "api/crm/bulk-send/route.ts", "api/crm/process-queue/route.ts",
  "api/coupons/bulk-assign/route.ts", "api/coupons/notify/route.ts", "api/notifications/send/route.ts"]);

/** Bir route kaynağında müşteriye dönen hata ayrıntısı satırları (satır no + metin). */
export function leakLines(src) {
  // Çok satırlı NextResponse.json({ … }) çağrılarını tek satıra indirip ara
  const out = [];
  const re = /(?:NextResponse|Response)\.json\(\s*\{[\s\S]{0,300}?\}\s*,/g;
  let m;
  while ((m = re.exec(src))) {
    const flat = m[0].replace(/\s+/g, " ");
    if (LEAK.test(flat)) out.push(`${src.slice(0, m.index).split("\n").length}: ${flat.slice(0, 120)}`);
  }
  return out;
}

export default {
  name: "Kod güvenliği (kaynak)",
  async run(t) {
    const { add, part } = t;
    await part("Kod güvenliği: e-posta, ödeme dönüşü, hata ayrıntısı", async () => {
      // 1) İptal: yönetici e-postasında müşteri metni temizleniyor
      const cc = rd("lib/customer-cancel.ts"), oc = rd("app/api/order-cancel/route.ts");
      const raw = /\(\$\{ibanName\}\)|\(\$\{orderName\}\)|<b>\$\{iban\}<\/b>/.test(cc);
      add(!raw && /esc\(ibanName\)/.test(cc) && /esc\(orderName\)/.test(cc) && /esc\(iban\)/.test(cc) && /const safe = String\(res\.error\)[^\n]*replace\(\/</.test(oc) ? "ok" : "fail",
        "İptal: IBAN sahibi adı / sipariş adı / hata metni yönetici e-postasına temizlenerek giriyor", raw ? "temizlenmemiş ${ibanName} / ${orderName} / ${iban} var" : "esc(...) / safe satırı eksik");

      // 2) iyzico dönüşü tek seferlik: ödendi / başarısız güncellemesi koşullu ve satır gelmezse yan etkisiz çıkış
      const cb = rd("app/api/checkout/iyzico/callback/route.ts");
      const paidOnce = /\.neq\("payment_status", "paid"\)\s*\.select\("id"\)/.test(cb) && /if \(!claimed\?\.length\)/.test(cb);
      const failOnce = /\.eq\("payment_status", "pending"\)\s*\.select\("id"\)/.test(cb) && /if \(!failedNow\?\.length\)/.test(cb);
      const failBeforeRestore = cb.indexOf("failedNow") >= 0 && cb.indexOf("failedNow") < cb.indexOf('rpc("restore_order_stock"');
      add(paidOnce && failOnce && failBeforeRestore ? "ok" : "fail", "iyzico dönüşü tek seferlik (ödendi / başarısız güncellemesi koşullu, ikinci dönüş yan etkisiz)",
        `ödendi koşullu ${paidOnce}, başarısız koşullu ${failOnce}, iptal stok iadesinden önce ${failBeforeRestore}`);

      // 3) Ödeme sayfası adresteki serbest metni göstermiyor; dönüş yalnız rakam kodu taşıyor
      const co = rd("app/checkout/page.tsx");
      add(!/get\("mesaj"\)/.test(co) && /BANK_DECLINE_TEXT\[/.test(co) && !/q\.set\("mesaj"/.test(cb) && /\^\\d\{3,6\}\$/.test(cb) ? "ok" : "fail",
        "Ödeme sayfası adresteki mesajı göstermiyor (yalnız bilinen banka kodu → sabit metin)", "checkout/page.tsx mesaj okuyor ya da dönüş serbest metin taşıyor");

      // 4) Müşteriye dönen cevaplarda veritabanı hata ayrıntısı yok (admin / cron ve yöneticiye özel uçlar hariç)
      const api = join(SRC, "app", "api");
      const leaks = [];
      let n = 0;
      for (const f of routeFiles(api)) {
        const rel = relative(join(SRC, "app"), f).split(sep).join("/");
        if (rel.startsWith("api/admin/") || rel.startsWith("api/cron/") || ADMIN_ONLY.has(rel)) continue;
        n++;
        for (const l of leakLines(readFileSync(f, "utf8"))) leaks.push(`${rel}:${l}`);
      }
      // Denetimin kendisi: sızdıran örnek yakalanmalı, genel mesaj geçmeli
      const self = leakLines(`return NextResponse.json({ error: error.message }, { status: 500 });\nreturn NextResponse.json({ error: "Kayıt başarısız", detail: insertError.message,\n code: 1 }, { status: 500 });\nreturn NextResponse.json({ error: "Kaydedilemedi" }, { status: 500 });`);
      add(self.length === 2 ? "ok" : "fail", "Hata ayrıntısı denetimi kendini doğruluyor", JSON.stringify(self));
      add(n >= 30 && !leaks.length ? "ok" : "fail", `Müşteriye dönen cevaplarda veritabanı hata ayrıntısı yok (${n} uç)`, leaks.slice(0, 8).join(" | ") || `yalnız ${n} uç okundu`);
    });
  },
};
