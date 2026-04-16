/**
 * Ürün Detay Sayfası — Server Component
 *
 * Sunucu tarafında çalışır:
 * - generateMetadata: title, description, Open Graph, Twitter Card
 * - Schema.org JSON-LD (GMC + Google Arama)
 * - ProductPageClient'a veri prop olarak aktarılır (SEO için sunucu render)
 */

import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Database } from "@/lib/database.types";
import ProductPageClient from "./ProductPageClient";
import ProductStructuredData from "@/components/products/ProductStructuredData";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";
const STORE_NAME = "YeriHisset";

// Ürün verisi sunucu tarafında bir kez çekilir
async function getProduct(slug: string) {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data } = await supabase
    .from("products")
    .select(`
      id, title, description, slug, price, stock, images, image_url, has_variants,
      brands (name),
      categories (name),
      product_variants (
        id, sku, price, compare_at_price, stock, is_active, variant_option_id,
        variant_options (
          value,
          variant_groups (name)
        )
      )
    `)
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  return data;
}

// Yorum istatistikleri — aggregateRating schema için
async function getReviewStats(productId: string): Promise<{ ratingValue: number; reviewCount: number } | null> {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data } = await supabase
    .from("product_reviews")
    .select("rating")
    .eq("product_id", productId)
    .eq("is_approved", true);

  if (!data || data.length === 0) return null;

  const reviewCount = data.length;
  const ratingValue = Math.round((data.reduce((sum, r) => sum + (r.rating ?? 0), 0) / reviewCount) * 10) / 10;

  return { ratingValue, reviewCount };
}

// --- Metadata (Open Graph + SEO) ---

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) {
    return {
      title: "Ürün Bulunamadı | YeriHisset",
    };
  }

  const productUrl = `${SITE_URL}/products/${product.slug}`;
  const primaryImage = product.images?.[0] ?? product.image_url ?? null;
  const description =
    product.description ??
    `${product.title} - YeriHisset'te ₺${product.price.toFixed(2)} fiyatıyla.`;

  return {
    title: `${product.title} | YeriHisset`,
    description,
    openGraph: {
      title: product.title,
      description,
      url: productUrl,
      siteName: STORE_NAME,
      locale: "tr_TR",
      type: "website",
      ...(primaryImage
        ? {
            images: [
              {
                url: primaryImage,
                alt: product.title,
                width: 800,
                height: 1000,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: product.title,
      description,
      ...(primaryImage ? { images: [primaryImage] } : {}),
    },
    alternates: {
      canonical: productUrl,
    },
  };
}

// --- Sayfa bileşeni ---

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) notFound();

  const reviewStats = await getReviewStats(product.id);

  return (
    <>
      {/* Schema.org JSON-LD — GMC ve Google Arama için yapısal veri */}
      <ProductStructuredData
        product={product as any}
        storeUrl={SITE_URL}
        storeName={STORE_NAME}
        currency="TRY"
        reviewStats={reviewStats ?? undefined}
      />

      {/* İnteraktif ürün sayfası (client component) */}
      <ProductPageClient product={product as any} />
    </>
  );
}
