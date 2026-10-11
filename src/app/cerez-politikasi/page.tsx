import StaticPageView, { staticPageMetadata } from "@/components/StaticPageView";

// Metin: Ayarlar › Sayfalar (static_pages) — varsayılanı src/config/static-pages.ts
export const revalidate = 60;
export const generateMetadata = () => staticPageMetadata("cerez-politikasi");

export default function CerezPolitikasiPage() {
  return <StaticPageView slug="cerez-politikasi" />;
}
