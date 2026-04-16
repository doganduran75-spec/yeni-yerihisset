/**
 * GlobalStructuredData
 * Site geneli Organization + WebSite JSON-LD schema.
 * Root layout'a eklenir — tüm sayfalarda <head>'e inject edilir.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";

export default function GlobalStructuredData() {
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: "YeriHisset",
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: `${SITE_URL}/opengraph-image`,
      width: 1200,
      height: 630,
    },
    sameAs: [
      // Sosyal medya profilleri eklenebilir:
      // "https://www.instagram.com/yerihisset",
      // "https://www.facebook.com/yerihisset",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      availableLanguage: "Turkish",
    },
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: "YeriHisset",
    description:
      "En yeni ürünler, harika fırsatlar ve zengin içerikler tek bir platformda.",
    publisher: {
      "@id": `${SITE_URL}/#organization`,
    },
    inLanguage: "tr-TR",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
    </>
  );
}
