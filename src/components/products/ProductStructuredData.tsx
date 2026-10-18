/**
 * GMC & SEO: Schema.org Product JSON-LD yapısal verisi.
 * Server Component — sayfanın <head> kısmına eklenir.
 * Google, Googlebot ile bu veriyi okuyarak Shopping'de ürünü gösterir.
 */

// JSON-LD güvenli yazım: "<" kaçışlanır → veri içindeki "</script>" bloğu kapatamaz
import { productSpecs } from "@/config/product-specs";
import { plain } from "@/lib/gmc-items";
import { SEGMENTS, type Segment } from "@/config/segments";

const safeJsonLd = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

interface ProductStructuredDataProps {
  product: {
    id: string;
    title: string;
    description: string | null;
    slug: string;
    price: number;
    stock: number;
    images: string[] | null;
    image_url: string | null;
    has_variants: boolean | null;
    model_code?: string | null;
    brands: { name: string } | null;
    categories: { name: string; slug?: string | null } | null;
    product_variants?: Array<{
      id: string;
      price: number;
      stock: number | null;
      sku: string | null;
      is_active: boolean | null;
      variant_options: { value: string; variant_groups: { name: string } | null } | null;
    }> | null;
  };
  storeUrl: string;
  storeName: string;
  currency?: string;
  reviewStats?: { ratingValue: number; reviewCount: number };
}

export default function ProductStructuredData({
  product,
  storeUrl,
  storeName,
  currency = "TRY",
  reviewStats,
  segment = "yetiskin",
}: ProductStructuredDataProps & { segment?: Segment }) {
  const productUrl = `${storeUrl}/products/${product.slug}`;
  const images = product.images?.length ? product.images : product.image_url ? [product.image_url] : [];
  const primaryImage = images[0] ?? "";

  const activeVariants = product.product_variants?.filter((v) => v.is_active) ?? [];
  const inStock = product.has_variants
    ? activeVariants.some((v) => (v.stock ?? 0) > 0)
    : product.stock > 0;

  // Variant'lı ürünlerde birden fazla Offer, yoksa tek Offer
  const offers =
    product.has_variants && activeVariants.length > 0
      ? activeVariants.map((v) => ({
          "@type": "Offer",
          url: `${productUrl}?variant=${v.id}`,
          priceCurrency: currency,
          price: v.price.toFixed(2),
          priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          availability: (v.stock ?? 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          itemCondition: "https://schema.org/NewCondition",
          seller: { "@type": "Organization", name: storeName },
          ...(v.sku ? { sku: v.sku } : {}),
          name: v.variant_options?.value,
        }))
      : [
          {
            "@type": "Offer",
            url: productUrl,
            priceCurrency: currency,
            price: product.price.toFixed(2),
            priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            itemCondition: "https://schema.org/NewCondition",
            seller: { "@type": "Organization", name: storeName },
          },
        ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: plain(product.description) || `${product.title} - ${storeName}'de satışta.`, // HTML açıklama → düz metin
    url: productUrl,
    ...(product.model_code ? { mpn: product.model_code, sku: product.model_code } : {}),
    // Teknik bilgiler (taban kalınlığı, malzeme, ağırlık…) — makinelerin okuyacağı biçimde
    ...(() => {
      const specs = productSpecs(product.brands?.name, product.title);
      return specs ? { additionalProperty: specs.map(([name, value]) => ({ "@type": "PropertyValue", name, value })) } : {};
    })(),
    ...(images.length > 0 ? { image: images } : {}),
    ...(product.brands?.name ? { brand: { "@type": "Brand", name: product.brands.name } } : {}),
    offers: offers.length === 1 ? offers[0] : offers,
    // Onaylanmış yorumlar varsa aggregateRating eklenir — Google yıldız gösterimini etkinleştirir
    ...(reviewStats && reviewStats.reviewCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: reviewStats.ratingValue,
            reviewCount: reviewStats.reviewCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };

  // Breadcrumb ek yapısal veri (GMC + arama motorları için faydalı)
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      // Ana Sayfa › Mağaza › Yetişkin / 0–4 Yaş İlkadım › Kategori › Ürün
      ...[
        { name: "Ana Sayfa", item: storeUrl },
        { name: "Mağaza", item: `${storeUrl}/magaza` },
        { name: SEGMENTS[segment].label, item: `${storeUrl}${SEGMENTS[segment].path}` },
        ...(product.categories?.name && product.categories.slug ? [{ name: product.categories.name, item: `${storeUrl}/kategori/${product.categories.slug}` }] : []),
        { name: product.title, item: productUrl },
      ].map((x, i) => ({ "@type": "ListItem", position: i + 1, ...x })),
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumb) }}
      />
    </>
  );
}
