import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js 16'da `middleware` konvansiyonu `proxy` olarak yeniden adlandırıldı.
 *
 * BAKIM MODU:
 *   .env içinde MAINTENANCE_MODE=1 yapınca tüm ziyaretçilere /maintenance
 *   sayfası gösterilir. Kapatmak için değeri kaldırın veya 0 yapın.
 *
 * ÖNİZLEME (sen siteyi bakımdayken görebilesin diye):
 *   MAINTENANCE_BYPASS_TOKEN=gizli-bir-anahtar tanımla, sonra siteyi
 *   https://site.com/?bypass=gizli-bir-anahtar ile aç → çerez kurulur,
 *   bakım modunda bile siteyi normal görürsün.
 */

const MAINTENANCE = process.env.MAINTENANCE_MODE === "1" || process.env.MAINTENANCE_MODE === "true";
const BYPASS_TOKEN = process.env.MAINTENANCE_BYPASS_TOKEN || "";
const BYPASS_COOKIE = "mnt_bypass";

export function proxy(request: NextRequest) {
  if (!MAINTENANCE) return NextResponse.next();

  const { pathname, searchParams } = request.nextUrl;

  // Bakım sayfasının kendisi her zaman erişilebilir
  if (pathname === "/maintenance") return NextResponse.next();

  // Bypass anahtarıyla gelen istek → çerez kur ve geç
  if (BYPASS_TOKEN && searchParams.get("bypass") === BYPASS_TOKEN) {
    const res = NextResponse.next();
    res.cookies.set(BYPASS_COOKIE, BYPASS_TOKEN, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 gün
    });
    return res;
  }

  // Geçerli bypass çerezi olan (sen) → normal siteyi gör
  if (BYPASS_TOKEN && request.cookies.get(BYPASS_COOKIE)?.value === BYPASS_TOKEN) {
    return NextResponse.next();
  }

  // Diğer herkes → bakım sayfası (URL değişmeden içerik gösterilir)
  const url = request.nextUrl.clone();
  url.pathname = "/maintenance";
  return NextResponse.rewrite(url, { status: 503 });
}

export const config = {
  // Statik dosyalar, görsel optimizasyonu ve metadata dosyaları hariç her yol
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|opengraph-image).*)",
  ],
};
