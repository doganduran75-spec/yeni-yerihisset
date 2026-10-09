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

// ISR: ürün sayfası sunucuda önbelleklenir, 5 dakikada bir tazelenir.
// (Stok/fiyat değişimi en geç 5 dk'da yansır; sepet/checkout zaten anlık doğrular.)
export const revalidate = 300;

// Ürün verisi sunucu tarafında bir kez çekilir
async function getProduct(slug: string) {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data } = await supabase
    .from("products")
    .select(`
      id, title, description, short_description, slug, price, stock, images, image_url, has_variants,
      category_id,
      brands (name, slug),
      categories (name, slug),
      product_variants (
        id, sku, price, compare_at_price, stock, is_active, variant_option_id, image_url,
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

// Ürün sayfasının üstündeki yıldızlar — GERÇEK yorumlardan (onaylı order_reviews; aşağıdaki
// yorum listesiyle aynı kural: ayar "tüm yorumlar" ise hepsi, değilse bu ürününkiler).
// Yorum yoksa null → yıldız gösterilmez (eskiden sabit "4.0 (12)" yazıyordu).
async function getRatingSummary(productId: string): Promise<{ avg: number; count: number } | null> {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ) as any;
  const { data: st } = await supabase.from("settings").select("product_reviews_show_all").limit(1).maybeSingle();
  let q = supabase.from("order_reviews").select("rating_shipping, rating_quality, rating_communication").eq("is_approved", true);
  if (st?.product_reviews_show_all === false) q = q.eq("product_id", productId);
  const { data } = await q;
  const per = ((data as any[]) ?? []).map((r) => {
    const nums = [r.rating_shipping, r.rating_quality, r.rating_communication].filter((x) => typeof x === "number") as number[];
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  }).filter((x): x is number => x !== null);
  if (!per.length) return null;
  return { avg: Math.round((per.reduce((a, b) => a + b, 0) / per.length) * 10) / 10, count: per.length };
}

// --- Metadata (Open Graph + SEO) ---

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) {
    return {
      title: "Ürün Bulunamadı",
    };
  }

  const productUrl = `${SITE_URL}/products/${product.slug}`;
  const primaryImage = product.images?.[0] ?? product.image_url ?? null;
  const description =
    product.description ??
    `${product.title} - YeriHisset'te ₺${product.price.toFixed(2)} fiyatıyla.`;

  return {
    title: `${product.title}`,
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
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ beden?: string; variant?: string }>;
}) {
  const { slug } = await params;
  const { beden, variant } = await searchParams; // ?variant= : katalog/reklam bağlantısı (feed)
  const product = await getProduct(slug);

  if (!product) notFound();

  const [reviewStats, ratingSummary] = await Promise.all([getReviewStats(product.id), getRatingSummary(product.id)]);

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
      <ProductPageClient product={product as any} initialSize={beden ?? null} initialVariantId={variant ?? null} ratingSummary={ratingSummary} />
    </>
  );
}
