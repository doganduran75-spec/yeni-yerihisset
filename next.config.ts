import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ─── Görsel Optimizasyonu ────────────────────────────────────────────────
  // next/image bileşeni bu domain'lerden gelen görselleri optimize eder
  // (WebP/AVIF dönüşümü, srcset, lazy loading otomatik yapılır)
  images: {
    remotePatterns: [
      // Supabase Storage
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

  // ─── Paket import optimizasyonu ─────────────────────────────────────────
  // Sadece kullanılan icon'ları bundle'a dahil eder (tree-shaking)
  optimizePackageImports: ["lucide-react"],
};

export default nextConfig;
