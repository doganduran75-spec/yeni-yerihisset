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
      const ui = rd("src/app/admin/orders/page.tsx");
      t.add(/microExportOf\(order\.external_raw\)/.test(ui) && /Mikro ihracat · \{mx\.country\}/.test(ui) ? "ok" : "fail",
        "Sipariş panelinde “Mikro ihracat · ülke” bilgisi");
    });
  },
};
