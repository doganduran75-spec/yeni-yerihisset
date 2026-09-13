import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";

export default function robots(): MetadataRoute.Robots {
  // Staging'de (NEXT_PUBLIC_NOINDEX=true) tüm site taramaya kapalı — dev alan adı
  // Google'a düşmesin. Canlıda bu env kaldırılınca normal kurallara döner.
  if (process.env.NEXT_PUBLIC_NOINDEX === "true") {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/sepet",
          "/checkout",
          "/account",
          "/api/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
