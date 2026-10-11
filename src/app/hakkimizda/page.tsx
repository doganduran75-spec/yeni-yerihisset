import StaticPageView, { staticPageMetadata } from "@/components/StaticPageView";

// Metin: Ayarlar › Sayfalar (static_pages) — varsayılanı src/config/static-pages.ts
export const revalidate = 60;
export const generateMetadata = () => staticPageMetadata("hakkimizda");

export default function HakkimizdaPage() {
  return <StaticPageView slug="hakkimizda" />;
}
