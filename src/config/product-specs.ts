// ÜRÜN TEKNİK BİLGİLERİ — ürün sayfasında "Teknik bilgiler" tablosu + yapısal veri (additionalProperty).
// Yapay zekâ ve arama motorları en çok sayısal, doğrulanabilir bilgiyi alıntılar (docs/SEO-GEO-ANALIZ.md).
// Kaynak: kullanıcıdan alınan bilgiler (docs/URUN-BILGILERI.md, 2026-10-11). Marka + ürün türüne göre.

export type SpecRow = [label: string, value: string];

const DODURA_COMMON: SpecRow[] = [
  ["Üretim", "İstanbul — el yapımı"],
  ["Dış yüz ve astar", "%100 gerçek deri (içi ve dışı)"],
  ["Taban", "5,5 mm organik kauçuk"],
  ["Ara katman", "1 mm keçe"],
  ["İç taban", "3 mm Orthoflex (geri dönüştürülmüş memory foam) + 1 mm gerçek deri"],
  ["Ayak ile zemin arası", "toplam ~10,5 mm"],
  ["Topuk farkı (drop)", "0 mm — topuk ve ön ayak aynı yükseklikte"],
  ["Kalıp", "Normal genişlik; parmak alanı klasik ayakkabılara göre geniş"],
];

const DODURA_WEIGHT: Record<"bot" | "babet" | "ayakkabi", string> = {
  bot: "298 g (42 numara, tek ayak)",
  ayakkabi: "250 g (42 numara, tek ayak)",
  babet: "180 g (42 numara, tek ayak)",
};

export function productSpecs(brand: string | null | undefined, title: string): SpecRow[] | null {
  if ((brand || "").toLocaleLowerCase("tr-TR") !== "dodura") return null;
  const t = title.toLocaleLowerCase("tr-TR");
  const kind = /\bbot\b/.test(t) ? "bot" : /babet/.test(t) ? "babet" : "ayakkabi";
  return [...DODURA_COMMON, ["Ağırlık", DODURA_WEIGHT[kind]]];
}
