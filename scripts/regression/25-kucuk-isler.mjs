// İŞ LİSTESİ TOPLU KAPANIŞ (kullanıcı 2026-11-27: "kendi yapacağın işleri kontrol et, yapabileceklerini yap"):
// - Hoş geldin kuponu aynı posta kutusuna bir kez (Gmail +ek / nokta / googlemail ile çoğaltma — güvenlik notu 2026-11-16 (1))
// - Cron şifresi sabit süreli karşılaştırma (güvenlik notu (6)) · gizli ayar testi _key / webhook kolonlarını da yakalar (05)
// - iyzico iadesi reddedilirse (bakiye) anlaşılır yazı + yeniden deneme yolu
// - Stok bildirimlerinde ürün / numara / kişi araması
// - Bireysel (e-Arşiv) site satışının iadesinde iade faturası yerine e-Gider Pusulası (Paraşüt'te elle; API ucu yok)
// - Panelden yüklenen görsel tarayıcıda en çok 1600 px WebP'ye küçülür
import { readFileSync } from "node:fs";

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const imp = async (p) => { try { return await import(new URL(`../../${p}`, import.meta.url)); } catch { return null; } };

export default {
  name: "Küçük işler: kupon, cron, iyzico, stok bildirimi, gider pusulası, görsel",
  async run(t) {
    await t.part("Kurallar", async () => {
      const m = await imp("src/lib/email-identity.ts");
      if (!m) t.add("warn", "Posta kutusu kuralı denenemedi", "Node TS yükleyemedi");
      else {
        const k = m.mailboxKey;
        const same = [["Ad.Soyad+kupon@gmail.com", "adsoyad@gmail.com"], ["adsoyad@googlemail.com", "adsoyad@gmail.com"], ["ali+1@firma.com", "ali@firma.com"]];
        const diff = [["ali.veli@firma.com", "aliveli@firma.com"], ["ali@gmail.com", "ali@hotmail.com"]];
        const bad = [...same.filter(([a, b]) => k(a) !== k(b)).map(([a]) => `${a} aynı sayılmadı`), ...diff.filter(([a, b]) => k(a) === k(b)).map(([a]) => `${a} yanlışlıkla aynı`)];
        t.add(!bad.length ? "ok" : "fail", "Aynı posta kutusu: Gmail +ek / nokta / googlemail aynı, diğer alan adlarında nokta farklı", bad.join(" · "));
      }
      const ms = rd("src/lib/member-status.ts");
      t.add(/sameMailboxUsers\(sb, userId, prof\?\.email/.test(ms) && /for \(const e of \(tw as any\[\]\) \|\| \[\]\) have\.add\(e\.coupon_id\)/.test(ms) ? "ok" : "fail",
        "Hoş geldin kuponu aynı posta kutusunun başka hesabı aldıysa yeniden verilmez");

      const c = await imp("src/lib/cron-auth.ts");
      if (c) {
        const old = process.env.CRON_SECRET;
        process.env.CRON_SECRET = "abc123";
        const ok = c.cronSecretOk("abc123") && !c.cronSecretOk("abc124") && !c.cronSecretOk("abc") && !c.cronSecretOk(null);
        process.env.CRON_SECRET = "";
        const ok2 = !c.cronSecretOk("");
        if (old === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = old;
        t.add(ok && ok2 ? "ok" : "fail", "Cron şifresi kontrolü (doğru / yanlış / boş)");
      }
      const routes = ["analytics-maintenance", "cart-abandonment", "expire-orders", "marketplace-sync", "process-email-queue", "server-health"];
      const badR = routes.filter((r) => { const s = rd(`src/app/api/cron/${r}/route.ts`); return !/cronSecretOk\(/.test(s) || /!== secret/.test(s); });
      t.add(!badR.length ? "ok" : "fail", "Tüm cron uçları sabit süreli şifre kontrolüyle", badR.join(", "));

      const iy = rd("src/lib/iyzico-refund.ts");
      t.add(/export function refundErrorText/.test(iy) && /bakiye\|balance\|yetersiz\|insufficient/.test(iy) && /refundErrorText\(v2\?\.errorMessage/.test(iy)
        && /iyzicoOk && <option value="iyzico">/.test(rd("src/app/admin/orders/page.tsx")) ? "ok" : "fail",
        "iyzico iadesi reddedilirse (bakiye yetersiz) anlaşılır yazı; “iyzico'dan şimdi otomatik iade et” yeniden denenebilir");

      const nx = await imp("src/lib/order-next-step.ts");
      if (nx) {
        const D = new Date().toISOString();
        const base = { channel: "site", status: "refunded", payment_status: "refunded", shipment_status: "returned", invoice_status: "invoiced", total_amount: 100, refunded_amount: 100, created_at: D };
        const arc = nx.orderNextStep({ ...base, parasut_e_doc_type: "e_archive" });
        const ein = nx.orderNextStep({ ...base, parasut_e_doc_type: "e_invoice" });
        const mp = nx.orderNextStep({ ...base, channel: "trendyol", status: "delivered", shipment_status: "delivered", mp_claim_state: "done", parasut_e_doc_type: "e_archive" });
        const keys = (s) => s.actions.map((a) => a.key).join(",");
        const ok = keys(arc) === "expense_voucher" && arc.stage === "Gider pusulası kesilecek" && nx.isReturnInvoiceDue(arc)
          && keys(ein).includes("return_invoice") && !keys(ein).includes("expense_voucher") && !keys(mp).includes("expense_voucher");
        t.add(ok ? "ok" : "fail", "Bireysel (e-Arşiv) site iadesi → “Gider pusulası kesildi”; kurumsal ve pazaryeri → iade faturası", ok ? "" : `${keys(arc)} / ${keys(ein)} / ${keys(mp)}`);
      }
      t.add(/case "expense_voucher":/.test(rd("src/app/admin/orders/page.tsx")) ? "ok" : "fail", "Siparişte “Gider pusulası kesildi” düğmesi işliyor");
    });

    await t.part("Ekranlar", async () => {
      const sn = rd("src/app/admin/crm/stock-notifications/page.tsx");
      t.add(/data-notify-search/.test(sn) && /const shown = notifications\.filter\(\(n\) => inTab\(n\) && matches\(n\)\)/.test(sn) && /n\.product_title, n\.variant_value, n\.sku/.test(sn) ? "ok" : "fail",
        "Stok bildirimlerinde ürün / numara / kişi araması");
      const files = ["src/components/admin/products/ProductForm.tsx", "src/components/admin/settings/ImageUploadInput.tsx", "src/components/admin/RichTextEditor.tsx", "src/components/admin/reviews/AddReviewDialog.tsx"];
      const miss = files.filter((f) => !/await shrinkImage\(/.test(rd(f)));
      const lib = rd("src/lib/image-shrink.ts");
      t.add(!miss.length && /SHRINK_MAX_PX = 1600/.test(lib) && /"image\/webp"/.test(lib) && /blob\.size >= file\.size\) return file/.test(lib) ? "ok" : "fail",
        "Panelden yüklenen görsel en çok 1600 px WebP'ye küçülüyor (ürün, site, Bilgi Bankası, yorum)", miss.join(", "));
    });

    // KESİNTİSİZ DEPLOY (kullanıcı 2026-11-27: "deploy sırasında sunucu yorulmasın"): yeni sürüm site açıkken ayrı klasörde
    // (.next-build), düşük öncelikle; build hata verirse eski sürüm çalışmaya devam eder; site yalnız npm ci gerekirse durur.
    await t.part("Deploy", async () => {
      const ds = rd("scripts/deploy.sh"), nc = rd("next.config.ts"), ts = rd("tsconfig.json"), gi = rd(".gitignore");
      const stops = ds.split(/\r?\n/).filter((l) => /^\s*pm2 stop yerihisset/.test(l)).length;
      const ok = /distDir: process\.env\.NEXT_DIST_DIR \|\| "\.next"/.test(nc)
        && /if ! NEXT_DIST_DIR="\$BUILD_DIR" \$LOW npm run build; then/.test(ds) && /mv "\$BUILD_DIR" \.next/.test(ds)
        && /cp -al \.next\/cache/.test(ds) && /LOW="nice -n 10"/.test(ds) && /\$LOW node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts\/regression\.mjs/.test(ds)
        && stops === 1 && ds.indexOf("pm2 stop yerihisset") < ds.indexOf("npm ci --no-audit") && ds.indexOf("pm2 stop yerihisset") > ds.indexOf('if [ "$LOCK_NOW" != "$LOCK_STAMP" ]')
        && /"\.next-build\/types\/\*\*\/\*\.ts"/.test(ts) && /\/\.next-build\//.test(gi) && /\/\.next-old\//.test(gi);
      t.add(ok ? "ok" : "fail", "Deploy kesintisiz: yeni sürüm site açıkken ayrı klasörde, düşük öncelikle; hata olursa eski sürüm çalışır (site yalnız npm ci'de durur)");
    });
  },
};
