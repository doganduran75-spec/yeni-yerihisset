import type { NextConfig } from "next";

// ─── Content-Security-Policy ───────────────────────────────────────────────
// Tarayıcıya "bu site yalnız şu kaynaklardan script/bağlantı/görsel yükler"
// der. Bir XSS açığı çıksa bile saldırganın kendi sunucusundan script
// çekmesini ve çalınan oturumu kendi sunucusuna GÖNDERMESİNİ (connect-src,
// img-src) engeller — oturum localStorage'da tutulduğu için önemli.
// Not: Next.js'in kendi satır içi script'leri için 'unsafe-inline' gerekir
// (nonce'lu CSP statik/ISR sayfaları dinamikleştirir). Yeni bir dış servis
// eklenirse (ör. harita, chat) buraya eklenmeli; yoksa tarayıcı engeller.
const SUPABASE_ORIGIN = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").origin; } catch { return ""; }
})();
const SUPABASE_WS = SUPABASE_ORIGIN.replace(/^https:/, "wss:");
const IYZICO = "https://*.iyzipay.com";
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://www.googletagmanager.com ${IYZICO}`,
  `style-src 'self' 'unsafe-inline' ${IYZICO}`,
  `img-src 'self' data: blob: ${SUPABASE_ORIGIN} https://ewnuurgmxhksbjixbian.supabase.co https://images.unsplash.com https://img.youtube.com https://*.google-analytics.com https://www.googletagmanager.com ${IYZICO}`,
  `font-src 'self' data: ${IYZICO}`,
  `connect-src 'self' ${SUPABASE_ORIGIN} ${SUPABASE_WS} https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com ${IYZICO}`,
  `media-src 'self' blob: ${SUPABASE_ORIGIN}`,
  `frame-src 'self' ${IYZICO} https://www.youtube.com https://www.youtube-nocookie.com`,
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https:",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  // ─── Sunucu-harici paketler ──────────────────────────────────────────────
  // iyzipay dinamik require() kullanıyor; Turbopack derleyemiyor.
  // Bunu bundle'a dahil etmeyip çalışma anında Node ile yükletiyoruz.
  serverExternalPackages: ["iyzipay"],

  // ─── Build: mevcut tip borçları derlemeyi durdurmasın ────────────────────
  // Not: Geçici. Stale database.types.ts yüzünden; tipler tazelenince kaldırılmalı.
  // (Next 16 artık build'de ESLint çalıştırmıyor; eski `eslint` anahtarı kaldırıldı.)
  typescript: { ignoreBuildErrors: true },

  // ─── Görsel Optimizasyonu ────────────────────────────────────────────────
  // next/image bileşeni bu domain'lerden gelen görselleri optimize eder
  // (WebP/AVIF dönüşümü, srcset, lazy loading otomatik yapılır)
  images: {
    remotePatterns: [
      // Supabase Storage (self-host)
      {
        protocol: "https",
        hostname: "supabase.yerihisset.com",
        pathname: "/storage/v1/object/public/**",
      },
      // Supabase Storage (eski bulut — geçiş dönemi)
      {
        protocol: "https",
        hostname: "ewnuurgmxhksbjixbian.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      // Unsplash (placeholder görseller için)
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      // YouTube thumbnail (Bilgi Bankası video kapakları)
      {
        protocol: "https",
        hostname: "img.youtube.com",
      },
    ],
    // Desteklenen formatlar (AVIF daha iyi sıkıştırma, WebP geniş destek)
    formats: ["image/avif", "image/webp"],
    // Minimum TTL: 1 gün (optimize edilmiş görseller cache'lenir)
    minimumCacheTTL: 86400,
  },

  // ─── Yönlendirmeler ──────────────────────────────────────────────────────
  // Eski /cart adresi kalıcı olarak /sepet'e taşındı (eski link/bookmark bozulmasın)
  async redirects() {
    return [
      { source: "/cart", destination: "/sepet", permanent: true },
    ];
  },

  // ─── HTTP Güvenlik Başlıkları ────────────────────────────────────────────
  async headers() {
    return [
      {
        // Tüm sayfalara uygula
        source: "/(.*)",
        headers: [
          // Clickjacking koruması
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Kaynak kısıtlaması (bkz. CSP açıklaması yukarıda)
          { key: "Content-Security-Policy", value: CSP },
          // Tarayıcı bu siteye 1 yıl boyunca YALNIZ HTTPS ile bağlansın
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // XSS koruması (modern tarayıcılar)
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Referrer bilgisi kontrolü
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // İzin politikası (gereksiz API'leri kapat)
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        // Public klasörü görselleri 1 gün cache
        source: "/(.*\\.(?:jpg|jpeg|png|gif|webp|avif|svg|ico))",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },

  // ─── X-Powered-By header'ını kaldır (güvenlik) ──────────────────────────
  poweredByHeader: false,
};

export default nextConfig;
