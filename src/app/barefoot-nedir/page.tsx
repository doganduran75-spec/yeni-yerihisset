import StaticPageView, { staticPageMetadata } from "@/components/StaticPageView";

// "Barefoot nedir?" ana rehberi — Ayarlar › Sayfalar'dan düzenlenir (varsayılan: src/config/static-pages.ts).
// Eski yazı (/bilgi-bankasi/barefoot-ayakkabi-nedir) ve eski WordPress adresleri buraya yönlendirilir (next.config).
export const revalidate = 60;
export const generateMetadata = () => staticPageMetadata("barefoot-nedir");

export default function BarefootNedirPage() {
  return <StaticPageView slug="barefoot-nedir" />;
}
