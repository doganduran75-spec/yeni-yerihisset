/**
 * ANA SAYFA İÇERİĞİ — tek kaynak (grup grup).
 *
 * Mobil (MobileHome) ve masaüstü (DesktopHome) ana sayfa metin/link/ayarları
 * BURADAN okunur. "Şu bölümü güncelleyelim" dendiğinde yalnız ilgili grubu
 * değiştirmek yeterli — bileşen kodlarına dokunmadan, izole ve güvenli.
 *
 * Not: Bu bir KOD config'idir (deploy ile yayına gider). İleride tek bir bölüm
 * (ör. promo) admin panelinden DB ile düzenlenebilir yapılırsa, buradaki
 * değerler "varsayılan/fallback" olarak kalır — DB boşsa sayfa yine doğru görünür.
 */

export const homeContent = {
  // ── Barefoot prensipleri (kullanıcı kararları 2026-10-18) ─────────────────
  // Ana sayfanın üstünde kaydırılabilir kartlar (mobilde ekranın ~1/3'ü) + telefonda ilk ziyarette tam ekran
  // "hikâye" (Instagram story gibi, turuncu ilerleme çubuğu). Sağlık iddiası yok; görseller çizim/illüstrasyon.
  // image: /principles/... (sitede) ya da tam adres; seconds: hikâyede kaç saniye kalsın; show: false → gizli.
  principles: {
    enabled: true,          // ana sayfadaki kaydırılabilir kartlar
    storiesEnabled: true,   // telefonda ilk ziyarette tam ekran hikâye
    eyebrow: "BAREFOOT NEDİR?",
    shopButton: "Alışverişe geç",
    replayLink: "Barefoot nedir? İzle",
    items: [
      { title: "Geniş parmak alanı", text: "Burun kısmı geniş; parmaklar sıkışmadan doğal hâliyle yayılır.", image: "/principles/1-genis-parmak.svg", seconds: 4, show: true },
      { title: "Sıfır topuk farkı", text: "Topuk ile parmak ucu aynı hizada; ayak düz basar.", image: "/principles/2-sifir-topuk.svg", seconds: 4, show: true },
      { title: "Esnek taban", text: "Taban ayağınla birlikte bükülür, her adıma eşlik eder.", image: "/principles/3-esnek-taban.svg", seconds: 4, show: true },
      { title: "İnce taban", text: "Zemini hissedersin — adı üstünde: yeri hisset.", image: "/principles/4-ince-taban.svg", seconds: 4, show: true },
      { title: "Hafiflik", text: "Ayağında yük değil; gün boyu hafif adımlar.", image: "/principles/5-hafiflik.svg", seconds: 4, show: true },
    ],
  },

  // ── Kategori kutuları (her kategoriden stoktaki bir ürün görseli) ─────────
  categories: {
    enabled: true,
    title: "Kategoriler",
  },

  // ── Güven barı (icon anahtarları: foot | leaf | truck | card) ─────────────
  trust: [
    { icon: "foot", label: "Doğal Ayak Sağlığı" },
    { icon: "leaf", label: "%100 Doğal Deri" },
    { icon: "truck", label: "Hızlı & Güvenli Kargo" },
    { icon: "card", label: "Vade Farksız 3 Taksit" },
  ] as { icon: "foot" | "leaf" | "truck" | "card"; label: string }[],
  // Mobilde daha az yer var; ilk kaç çip gösterilsin
  trustMobileCount: 3,

  // ── Popüler ürünler bölümü ────────────────────────────────────────────────
  products: {
    eyebrow: "POPÜLER MODELLER",
    eyebrowMobile: "HIZLI BAKIŞ",
    title: "Öne Çıkan Barefoot Seçenekleri",
    titleMobile: "Popüler Modeller",
    seeAll: "Tümünü Gör",
    seeAllMobile: "Tümü",
    href: "/magaza",
    limitDesktop: 4,
    limitMobile: 8,
  },

  // ── Reklam bandı ("Vade Farksız 3 Taksit") ────────────────────────────────
  promo: {
    enabled: true, // false yaparsan bant tamamen gizlenir
    title: "VADE FARKSIZ 3 TAKSİT",
    subtitle: "Tüm Dodura & Attipas ayakkabılarda peşin fiyatına taksit avantajı",
    cta: "Alışverişe Başla",
    href: "/magaza",
  },

  // ── "Doğru Numarayı Bul" bandı (yalnız mobil) ─────────────────────────────
  sizeFinder: {
    enabled: true,
    title: "Doğru Numarayı Bul",
    body: "Ayak tabanı ölçünü gir, sıfır yanılma payıyla barefoot bedenini belirleyelim.",
    href: "/magaza",
  },

  // ── Footer (masaüstü ana sayfaya özel) ────────────────────────────────────
  footer: {
    brandName: "YeriHisset",
    brandDesc: "Doğal ayak anatomisini koruyan, sıfır düşüş ve geniş burun tasarımlı barefoot ayakkabılarla yeri hissedin.",
    columns: [
      {
        title: "Koleksiyonlar",
        links: [
          { label: "Tüm Barefoot Modelleri", href: "/magaza" },
          { label: "Dodura Yetişkin Serisi", href: "/marka/dodura" },
          { label: "Attipas İlk Adım", href: "/marka/attipas" },
          { label: "Doğal Taban Çoraplar", href: "/magaza" },
        ],
      },
      {
        title: "Faydalı Bilgiler",
        links: [
          { label: "Barefoot Ayakkabı Nedir?", href: "/barefoot-nedir" },
          { label: "Ayak Ölçüm Rehberi", href: "/bilgi-bankasi" },
          { label: "Sıkça Sorulan Sorular", href: "/bilgi-bankasi" },
          { label: "İade ve Değişim", href: "/iade-degisim" },
          { label: "Hakkımızda", href: "/hakkimizda" },
          { label: "İletişim", href: "/iletisim" },
        ],
      },
    ],
    newsletterTitle: "Bülten",
    newsletterBody: "Yeni modeller ve yalınayak sağlık rehberlerinden haberdar olun.",
    copyright: "© 2024 YeriHisset. Tüm hakları saklıdır.",
    tagline: "Doğal adımlar, sağlıklı beden.",
    legal: [
      { label: "Gizlilik", href: "/gizlilik" },
      { label: "KVKK", href: "/kvkk" },
      { label: "Çerez Politikası", href: "/cerez-politikasi" },
      { label: "Mesafeli Satış", href: "/mesafeli-satis" },
    ],
  },
};

export type HomeContent = typeof homeContent;
