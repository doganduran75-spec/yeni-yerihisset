// MİKRO İHRACAT (kullanıcı 2026-11-26): Trendyol yurtdışı siparişi (ör. Azerbaycan, paket `micro: true` + `orderCountryCode`)
// panelde "Mikro ihracat · ülke" olarak görünür; Paket hazır'da fatura otomatik ama yurtdışı kurallarıyla kesilir:
// e-Arşiv, tüm kalemler %0 KDV, 301 istisna kodu, alıcı yurtdışı (Paraşüt is_abroad + ülke, vergi no 2222222222).
import { readFileSync } from "node:fs";

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

export default {
  name: "Mikro ihracat faturası (Trendyol yurtdışı)",
  async run(t) {
    await t.part("Kural: yurtdışı siparişi tanıma", async () => {
      let mx = null;
      try { mx = await import(new URL("../../src/lib/micro-export.ts", import.meta.url)); } catch { /* eski Node */ }
      if (!mx) { t.add("warn", "Mikro ihracat kuralı denenemedi", "Node TS yükleyemedi"); return; }
      const az = mx.microExportOf({ micro: true, orderCountryCode: "AZ", hsCode: "640299960000" });
      const cases = [
        ["Trendyol AZ siparişi (34731) → Azerbaycan", az?.country === "Azerbaycan" && az?.hsCode === "640299960000"],
        ["Yurtiçi sipariş (micro false) → değil", mx.microExportOf({ micro: false, orderCountryCode: "TR" }) === null],
        ["micro işareti yoksa → değil", mx.microExportOf({ orderCountryCode: "AZ" }) === null],
        ["micro ama ülke TR → değil", mx.microExportOf({ micro: true, orderCountryCode: "TR" }) === null],
        ["Ülke kodu yalnız fatura adresinde → tanınır", mx.microExportOf({ micro: true, invoiceAddress: { countryCode: "de" } })?.country === "Almanya"],
        ["Bilinmeyen ülke → kodla", mx.microExportOf({ micro: true, orderCountryCode: "ZZ" })?.country === "ZZ"],
      ];
      const bad = cases.filter(([, ok]) => !ok).map(([l]) => l);
      t.add(!bad.length ? "ok" : "fail", "Mikro ihracat yalnız micro + yurtdışı ülkede tanınır", bad.join(" · "));
      // Teslim şartı ülkeye göre (Trendyol Akademi): AZ/UA/MD/RS → DAP, Körfez + Avrupa → DDP
      const dt = ["AZ", "UA", "MD", "RS"].every((c) => mx.deliveryTermFor(c) === "DAP") && ["AE", "SA", "DE", "NL"].every((c) => mx.deliveryTermFor(c) === "DDP") && mx.deliveryTermFor("az") === "DAP";
      const note = mx.microExportNote(az);
      t.add(dt && /Menşei: Türkiye/.test(note) && /GTİP: 640399930000/.test(note) && /Teslim şartı: DAP/.test(note) && /Alıcı ülke: Azerbaycan/.test(note) ? "ok" : "fail",
        "Teslim şartı Azerbaycan / Ukrayna / Moldova / Sırbistan DAP, Körfez + Avrupa DDP; fatura notunda menşei + GTİP + teslim şartı", note);
      t.add(mx.MICRO_EXPORT_VAT_EXEMPTION === "301" && mx.FOREIGN_TAX_NUMBER === "2222222222" ? "ok" : "fail",
        "İstisna kodu 301, yurtdışı alıcı vergi no 2222222222");
    });

    await t.part("Fatura kodu + panel", async () => {
      const inv = rd("src/lib/parasut-invoice.ts");
      const okInv = /mx_micro:external_raw->micro/.test(inv) && /mx_country:external_raw->>orderCountryCode/.test(inv)
        && /vat: abroad \? 0 : v/.test(inv)
        && /taxNo = abroad \? ""/.test(inv)
        && /tax_number: x\.abroad \? FOREIGN_TAX_NUMBER/.test(inv)
        && /is_abroad: true, country: x\.abroad\.country/.test(inv)
        && /vat_exemption_reason_code: MICRO_EXPORT_VAT_EXEMPTION/.test(inv);
      t.add(okInv ? "ok" : "fail", "Mikro ihracatta Paraşüt faturası %0 KDV + yurtdışı alıcı + e-Arşiv 301 istisna");
      // Trendyol mikro ihracat fatura yüklemesi: invoiceNumber + invoiceDateTime zorunlu (yoksa 400 "Micro export type'lari icin fatura bilgisi zorunludur")
      const ty = rd("src/lib/marketplace/trendyol.ts"), mi = rd("src/lib/marketplace-invoice.ts");
      const re = /\^\[A-Z0-9\]\{3\}20\\d\{2\}\\d\{9\}\$/;
      const reOk = new RegExp("^[A-Z0-9]{3}20\\d{2}\\d{9}$").test("KA02026000000329");
      t.add(/form\.append\("invoiceNumber", micro\.invoiceNumber\)/.test(ty) && /form\.append\("invoiceDateTime"/.test(ty)
        && /mx_micro:external_raw->micro/.test(mi) && re.test(mi) && reOk && /`\$\{o\.external_package_id\}\.pdf`, micro\)/.test(mi) ? "ok" : "fail",
        "Mikro ihracatta Trendyol'a fatura no (KA02026000000329 biçimi) + tarih ile yüklenir");
      // Kalem: GTİP (Paraşüt ürün kaydı, boşsa 6403.99.93) + Havayolu + DDP; yanlış kesilen faturayı yeniden kesme (Paraşüt'te geçerliyse ret)
      const mxs = rd("src/lib/micro-export.ts"), route = rd("src/app/api/admin/parasut/route.ts");
      t.add(/MICRO_EXPORT_GTIP = "640399930000"/.test(mxs) && /MICRO_EXPORT_SHIPPING = "Havayolu"/.test(mxs) && /MICRO_EXPORT_ORIGIN = "Türkiye"/.test(mxs)
        && /if \(x\.abroad\) await ensureGtip\(/.test(inv) && /if \(a\.gtip\) continue;/.test(inv)
        && /shipping_method: MICRO_EXPORT_SHIPPING, delivery_method: deliveryTermFor\(x\.abroad\.countryCode\)/.test(inv)
        && /Ürün kodu \$\{l\.sku\}/.test(inv) && /Menşei: \$\{MICRO_EXPORT_ORIGIN\}/.test(inv) && /invoice_note: microExportNote\(x\.abroad\)/.test(inv) ? "ok" : "fail",
        "Mikro ihracat kalemi: GTİP 6403.99.93 (ürün kaydı boşsa), ürün kodu + menşei, Havayolu, ülkeye göre teslim şartı, fatura notu");
      t.add(/export async function redoInvoiceOrder/.test(inv) && /hâlâ geçerli — önce Paraşüt'te e-Arşiv'i iptal et/.test(inv)
        && /invoice_status: "pending", mp_invoice_sent_at: null/.test(inv) && /case "redo_invoice"/.test(route) ? "ok" : "fail",
        "Faturayı yeniden kes: Paraşüt'te iptal / silinmediyse reddeder, sonra sıfırlayıp baştan keser");
      const ui = rd("src/app/admin/orders/page.tsx");
      t.add(/microExportOf\(order\.external_raw\)/.test(ui) && /Mikro ihracat · \{mx\.country\}/.test(ui) ? "ok" : "fail",
        "Sipariş panelinde “Mikro ihracat · ülke” bilgisi");
      // Yurtdışı faturası telafi edilemez → listede + detayda ayrı etiket, Paket hazır / elle faturada açık onay
      const badge = (ui.match(/<MicroExportBadge order=\{/g) || []).length;
      const conf = (ui.match(/Yurtdışı faturası sonradan düzeltilemez/g) || []).length;
      t.add(/function MicroExportBadge/.test(ui) && /Mikro İhracat · \{mx\.countryCode\}/.test(ui) && badge >= 2 && conf >= 2 ? "ok" : "fail",
        "Listede + detayda “Mikro İhracat” etiketi; Paket hazır ve elle faturada onay", `etiket ${badge}, onay ${conf}`);
    });
  },
};
