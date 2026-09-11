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
  // ── Karşılama / segmentasyon ──────────────────────────────────────────────
  hero: {
    badge: "Yerin Hissini Keşfedin — Doğal Adımlara Hoş Geldiniz", // masaüstü pill rozet
    question: "Bugün YeriHisset'e hangi adımla geldin?",
    subtitleDesktop: "Sana en doğru deneyimi sunabilmemiz için ihtiyacını seç, yolculuğunu birlikte başlatalım.",
    subtitleMobile: "Sana en uygun deneyimi seçerek başlayalım",
    promptMobile: "Neden buradasın?",
    continueLink: "Veya doğrudan ana sayfaya devam et",
  },

  // ── İki seçim kartı ───────────────────────────────────────────────────────
  cards: {
    learn: {
      pill: "İlk Kez Başlayanlar İçin",
      pillMobile: "İlk kez başlayanlar",
      title: "Barefoot Rehberini Keşfet",
      titleMobile: "Barefoot Rehberini Keşfet",
      body: "Yalınayak felsefesi, anatomik ayak yapısı ve sağlıklı adımların biyomekaniğini keşfedin.",
      cta: "Rehberi İncele",
      href: "/barefoot-nedir",
    },
    shop: {
      pill: "Doğrudan Alışveriş",
      pillMobile: "Koleksiyonları incele",
      title: "Doğrudan Mağazaya Geç",
      titleMobile: "Doğrudan Mağazaya Geç",
      body: "Dodura deri ayakkabılar, Attipas ilk adım modelleri ve denge barlarını hemen inceleyin.",
      cta: "Koleksiyonları Gör",
      href: "/products",
    },
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
    href: "/products",
    limitDesktop: 4,
    limitMobile: 8,
  },

  // ── Reklam bandı ("Vade Farksız 3 Taksit") ────────────────────────────────
  promo: {
    enabled: true, // false yaparsan bant tamamen gizlenir
    title: "VADE FARKSIZ 3 TAKSİT",
    subtitle: "Tüm Dodura & Attipas ayakkabılarda peşin fiyatına taksit avantajı",
    cta: "Alışverişe Başla",
    href: "/products",
  },

  // ── "Doğru Numarayı Bul" bandı (yalnız mobil) ─────────────────────────────
  sizeFinder: {
    enabled: true,
    title: "Doğru Numarayı Bul",
    body: "Ayak tabanı ölçünü gir, sıfır yanılma payıyla barefoot bedenini belirleyelim.",
    href: "/products",
  },

  // ── Footer (masaüstü ana sayfaya özel) ────────────────────────────────────
  footer: {
    brandName: "YeriHisset",
    brandDesc: "Doğal ayak anatomisini koruyan, sıfır düşüş ve geniş burun tasarımlı barefoot ayakkabılarla yeri hissedin.",
    columns: [
      {
        title: "Koleksiyonlar",
        links: [
          { label: "Tüm Barefoot Modelleri", href: "/products" },
          { label: "Dodura Yetişkin Serisi", href: "/marka/dodura" },
          { label: "Attipas İlk Adım", href: "/marka/attipas" },
          { label: "Doğal Taban Çoraplar", href: "/products" },
        ],
      },
      {
        title: "Faydalı Bilgiler",
        links: [
          { label: "Barefoot Ayakkabı Nedir?", href: "/barefoot-nedir" },
          { label: "Ayak Ölçüm Rehberi", href: "/bilgi-bankasi" },
          { label: "Sıkça Sorulan Sorular", href: "/bilgi-bankasi" },
          { label: "İade ve Değişim", href: "/bilgi-bankasi" },
        ],
      },
    ],
    newsletterTitle: "Bülten",
    newsletterBody: "Yeni modeller ve yalınayak sağlık rehberlerinden haberdar olun.",
    copyright: "© 2024 YeriHisset. Tüm hakları saklıdır.",
    tagline: "Doğal adımlar, sağlıklı beden.",
  },
};

export type HomeContent = typeof homeContent;
