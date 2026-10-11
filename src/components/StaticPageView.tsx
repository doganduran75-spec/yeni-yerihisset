import type { Metadata } from "next";
import LegalPageLayout from "@/components/LegalPageLayout";
import { getStaticPage } from "@/lib/static-pages";
import type { StaticPageSlug } from "@/config/static-pages";

// Düzenlenebilir sayfa (Ayarlar › Sayfalar): başlık, giriş, HTML gövde, taslak durumu veritabanından.
// Taslak → sayfada uyarı + arama motoruna kapalı. Sayfalar 60 sn'de bir tazelenir (her sayfa dosyası revalidate=60).

export async function staticPageMetadata(slug: StaticPageSlug): Promise<Metadata> {
  const p = await getStaticPage(slug);
  return {
    title: p.title,
    alternates: { canonical: `/${slug}` },
    ...(p.draft ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function StaticPageView({ slug }: { slug: StaticPageSlug }) {
  const p = await getStaticPage(slug);
  const updated = p.updatedAt
    ? new Date(p.updatedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })
    : "11 Ekim 2026";
  return (
    <LegalPageLayout title={p.title} intro={p.intro} draft={p.draft} updated={updated}>
      <div dangerouslySetInnerHTML={{ __html: p.body }} />
    </LegalPageLayout>
  );
}
