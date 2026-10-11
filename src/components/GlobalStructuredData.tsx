/**
 * GlobalStructuredData
 * Site geneli Organization + WebSite JSON-LD schema.
 * Root layout'a eklenir — tüm sayfalarda <head>'e inject edilir.
 */

// JSON-LD güvenli yazım: "<" kaçışlanır → veri içindeki "</script>" bloğu kapatamaz
const safeJsonLd = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

import { COMPANY } from "@/config/company";
import { TRIAL_DAYS } from "@/lib/order-next-step";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";

export default function GlobalStructuredData() {
  const organization = {
    "@context": "https://schema.org",
    // OnlineStore: yapay zekâ ve arama motorları için "YeriHisset = Türkiye'de barefoot ayakkabı satan çevrim içi
    // mağaza" varlık tanımı (şirket unvanı, adres, iletişim, iade politikası). Künye: src/config/company.ts
    "@type": "OnlineStore",
    "@id": `${SITE_URL}/#organization`,
    name: "YeriHisset",
    legalName: COMPANY.title,
    description: "Türkiye'de barefoot (çıplak ayak hissi veren) ayakkabı mağazası: yetişkinler için Dodura, ilk adımlar için Attipas.",
    url: SITE_URL,
    email: COMPANY.email,
    ...(COMPANY.phone ? { telephone: COMPANY.phone } : {}),
    taxID: COMPANY.taxNumber.replace(/\s/g, ""),
    address: {
      "@type": "PostalAddress",
      streetAddress: "Barbaros Mah. Begonya Sok. No:1/2 Nida Kule Batı",
      addressLocality: "Ataşehir",
      addressRegion: "İstanbul",
      addressCountry: "TR",
    },
    areaServed: { "@type": "Country", name: "Türkiye" },
    knowsAbout: ["barefoot ayakkabı", "minimalist ayakkabı", "ilk adım ayakkabısı", "çocuk ayak gelişimi"],
    hasMerchantReturnPolicy: {
      "@type": "MerchantReturnPolicy",
      applicableCountry: "TR",
      returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
      merchantReturnDays: TRIAL_DAYS,
      returnMethod: "https://schema.org/ReturnByMail",
      returnFees: "https://schema.org/FreeReturn",
    },
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
      email: COMPANY.email,
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
      "Barefoot ayakkabı: geniş burun, sıfır topuk farkı, esnek ince taban. Yetişkin ve çocuk modelleri, rehberler.",
    publisher: {
      "@id": `${SITE_URL}/#organization`,
    },
    inLanguage: "tr-TR",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/ara?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(website) }}
      />
    </>
  );
}
