import StaticPageView, { staticPageMetadata } from "@/components/StaticPageView";

// Metin: Ayarlar › Sayfalar (static_pages) — varsayılanı src/config/static-pages.ts
export const revalidate = 60;
export const generateMetadata = () => staticPageMetadata("iade-degisim");

export default function IadeDegisimPage() {
  return <StaticPageView slug="iade-degisim" />;
}
