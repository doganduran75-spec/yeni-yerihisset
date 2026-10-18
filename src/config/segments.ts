// Mağaza segmentleri (kullanıcı kararları 2026-10-18): /magaza seçim ekranı → /magaza/yetiskin, /magaza/ilkadim.
// Kategori → segment eşleşmesi categories.segment'te (Ayarlar › Kategoriler). Metinler arama motoru ve yapay zekâ
// için: başlık ve tanıtım, insanların aradığı kelimeleri taşır.
export type Segment = "yetiskin" | "ilkadim";

export const SEGMENTS: Record<Segment, {
  label: string;        // kısa ad (seçim kartı, gezinti yolu, etiket)
  h1: string;           // sayfa başlığı
  title: string;        // tarayıcı / Google başlığı
  intro: string;        // başlık altı kısa tanıtım
  card: string;         // seçim kartındaki alt yazı
  goTo: string;         // diğer segmentten geçiş bağlantısı
  path: string;
}> = {
  yetiskin: {
    label: "Yetişkin",
    h1: "Yetişkin Barefoot Ayakkabı",
    title: "Yetişkin Barefoot Ayakkabı — Ayakkabı, Babet, Bot",
    intro: "Geniş burunlu, sıfır topuk farklı, esnek ince tabanlı barefoot ayakkabı, babet ve botlar. Önce numaranı seç, stoktakileri gör; 14 gün evde dene.",
    card: "Ayakkabı, babet, bot ve aksesuar",
    goTo: "Yetişkin mağazasına geç",
    path: "/magaza/yetiskin",
  },
  ilkadim: {
    label: "0–4 Yaş İlkadım",
    h1: "0–4 Yaş İlkadım ve Bebek Barefoot Ayakkabı",
    title: "0–4 Yaş İlkadım ve Bebek Barefoot Ayakkabı",
    intro: "İlk adımlar için esnek, ince ve kaymaz tabanlı, geniş burunlu bebek barefoot ayakkabılar. Ayağını ölç, numarasını seç; büyüme payını ölçü tablosunda gör.",
    card: "İlk adım ve bebek ayakkabıları",
    goTo: "0–4 Yaş İlkadım mağazasına geç",
    path: "/magaza/ilkadim",
  },
};

export const isSegment = (s: unknown): s is Segment => s === "yetiskin" || s === "ilkadim";
export const otherSegment = (s: Segment): Segment => (s === "yetiskin" ? "ilkadim" : "yetiskin");
/** Ziyaretçinin son seçtiği segment (tarayıcıda) */
export const LAST_SEGMENT_KEY = "yh-last-segment";
