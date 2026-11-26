// MİKRO İHRACAT (Trendyol yurtdışı satış, ör. Azerbaycan) — kullanıcı 2026-11-26:
// Trendyol paketi `micro: true` + `orderCountryCode` (AZ…) ile gelir; paket Türkiye'deki Trendyol deposuna gider.
// Fatura otomatik: e-Arşiv, tüm kalemler %0 KDV, 301 istisna kodu (11/1-a mal ihracatı), alıcı yurtdışı
// (Paraşüt is_abroad + ülke, vergi no 2222222222). Tutar Trendyol satış tutarının aynısı (KDV ayrıştırılmaz).

export const MICRO_EXPORT_VAT_EXEMPTION = "301";
export const FOREIGN_TAX_NUMBER = "2222222222";
/** Kalem satırı (eski elle kesilen mikro ihracat faturasıyla aynı): GTİP, gönderim şekli, teslim şartı.
 *  GTİP 6403.99.93 = üst yüzü deri ayakkabı (kullanıcı 2026-11-26; Trendyol'un gönderdiği 6402 kauçuk/plastik üst yüz).
 *  GTİP Paraşüt'te ÜRÜN kaydındadır → ürünün GTİP'i boşsa fatura kesilmeden önce yazılır (doluysa dokunulmaz). */
export const MICRO_EXPORT_GTIP = "640399930000";
export const MICRO_EXPORT_SHIPPING = "Havayolu";
export const MICRO_EXPORT_ORIGIN = "Türkiye";
/** Teslim şartı ülkeye göre (Trendyol Akademi "Mikro İhracat Faturası için Yapılacaklar", 2026-11-26):
 *  Azerbaycan, Ukrayna, Moldova, Sırbistan → DAP; Körfez ve Avrupa → DDP. Listede olmayan ülke → DDP. */
const DAP_COUNTRIES = ["AZ", "UA", "MD", "RS"];
export const deliveryTermFor = (countryCode: string): "DAP" | "DDP" => (DAP_COUNTRIES.includes(String(countryCode).toUpperCase()) ? "DAP" : "DDP");
/** Fatura notu: Trendyol listesindeki mikro ihracat bilgileri (menşei, GTİP, teslim şartı) — PDF'te her durumda görünsün */
// e-Arşiv PDF'inde kalem adı Paraşüt ÜRÜN adından gelir (tanım / GTİP / teslim sütunu basılmaz — KA02026000000331),
// bu yüzden ürün kodu (tam SKU) + Türkçe tanım da nota yazılır.
export const microExportNote = (m: MicroExport, items: { title: string; sku?: string; qty: number }[] = []) =>
  `Mikro ihracat · Alıcı ülke: ${m.country} · Menşei: ${MICRO_EXPORT_ORIGIN} · GTİP: ${MICRO_EXPORT_GTIP} · Teslim şartı: ${deliveryTermFor(m.countryCode)} · Gönderim: ${MICRO_EXPORT_SHIPPING}`
  + items.map((i) => `\nÜrün: ${i.title}${i.sku ? ` · Ürün kodu: ${i.sku}` : ""} · ${i.qty} adet`).join("");

const COUNTRY_TR: Record<string, string> = {
  AZ: "Azerbaycan", DE: "Almanya", NL: "Hollanda", BE: "Belçika", FR: "Fransa", AT: "Avusturya", GB: "Birleşik Krallık",
  BG: "Bulgaristan", RO: "Romanya", GR: "Yunanistan", CZ: "Çekya", HU: "Macaristan", PL: "Polonya", SK: "Slovakya",
  SA: "Suudi Arabistan", AE: "Birleşik Arap Emirlikleri", KW: "Kuveyt", QA: "Katar", BH: "Bahreyn", OM: "Umman",
  GE: "Gürcistan", KZ: "Kazakistan", UZ: "Özbekistan", KG: "Kırgızistan", TM: "Türkmenistan", UA: "Ukrayna",
  IQ: "Irak", CY: "Kıbrıs", US: "Amerika Birleşik Devletleri", MD: "Moldova", RS: "Sırbistan",
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
