// MİKRO İHRACAT (Trendyol yurtdışı satış, ör. Azerbaycan) — kullanıcı 2026-11-26:
// Trendyol paketi `micro: true` + `orderCountryCode` (AZ…) ile gelir; paket Türkiye'deki Trendyol deposuna gider.
// Fatura otomatik: e-Arşiv, tüm kalemler %0 KDV, 301 istisna kodu (11/1-a mal ihracatı), alıcı yurtdışı
// (Paraşüt is_abroad + ülke, vergi no 2222222222). Tutar Trendyol satış tutarının aynısı (KDV ayrıştırılmaz).

export const MICRO_EXPORT_VAT_EXEMPTION = "301";
export const FOREIGN_TAX_NUMBER = "2222222222";

const COUNTRY_TR: Record<string, string> = {
  AZ: "Azerbaycan", DE: "Almanya", NL: "Hollanda", BE: "Belçika", FR: "Fransa", AT: "Avusturya", GB: "Birleşik Krallık",
  BG: "Bulgaristan", RO: "Romanya", GR: "Yunanistan", CZ: "Çekya", HU: "Macaristan", PL: "Polonya", SK: "Slovakya",
  SA: "Suudi Arabistan", AE: "Birleşik Arap Emirlikleri", KW: "Kuveyt", QA: "Katar", BH: "Bahreyn", OM: "Umman",
  GE: "Gürcistan", KZ: "Kazakistan", UZ: "Özbekistan", KG: "Kırgızistan", TM: "Türkmenistan", UA: "Ukrayna",
  IQ: "Irak", CY: "Kıbrıs", US: "Amerika Birleşik Devletleri",
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export type MicroExport = { countryCode: string; country: string; hsCode: string | null };

/** Pazaryeri ham paketinden mikro ihracat bilgisi; değilse null */
export function microExportOf(raw: any): MicroExport | null {
  if (!raw || raw.micro !== true) return null;
  const code = String(raw.orderCountryCode || raw.invoiceAddress?.countryCode || "").toUpperCase();
  if (!code || code === "TR") return null;
  return { countryCode: code, country: COUNTRY_TR[code] || code, hsCode: raw.hsCode ? String(raw.hsCode) : null };
}
