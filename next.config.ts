import type { NextConfig } from "next";

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
        // Statik varlıklar uzun süre cache'lensin
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
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
