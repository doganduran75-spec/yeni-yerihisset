/**
 * Google Merchant Center Ürün Beslemesi
 * URL: /feed/google-merchant
 *
 * GMC'de "Veri Kaynakları > Birincil Besleme" bölümünde bu URL'yi girin.
 * Opsiyonel gizlilik: ?secret=XXXX  (Ayarlar > GMC > Feed Secret)
 *
 * GMC zorunlu alanlar: id, title, description, link, image_link,
 *                       availability, price, brand, condition
 */

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

// XML özel karakterleri kaçır
function esc(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Stok durumunu GMC formatına çevir
function availability(stock: number | null | undefined): string {
  return (stock ?? 0) > 0 ? "in_stock" : "out_of_stock";
}

export async function GET(request: NextRequest) {
  const supabase = createAdminClient();

  // Feed güvenliği: opsiyonel secret kontrolü
  const { data: settings } = await supabase.from("settings").select("*").single();
  const feedSecret = settings?.gmc_feed_secret;

  if (feedSecret) {
    const secret = request.nextUrl.searchParams.get("secret");
    if (secret !== feedSecret) {
      return new Response("Yetkisiz", { status: 401 });
    }
  }

  const storeName = settings?.store_name || "YeriHisset";
  const storeUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";
  const currency = settings?.currency || "TRY";
  const condition = settings?.gmc_product_condition || "new";
  const defaultBrand = settings?.gmc_brand_default || storeName;
  const defaultCategory = settings?.gmc_default_category || "";

  // Tüm aktif ürünleri çek
  const { data: products, error } = await supabase
    .from("products")
    .select(`
      id, title, description, slug, price, stock, images, image_url, has_variants, tags,
      brands (name),
      categories (name),
      product_variants (
        id, sku, price, stock, is_active,
        variant_options (
          value,
          variant_groups (name)
        )
      )
    `)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("GMC feed error:", error);
    return new Response("Feed oluşturulurken hata oluştu", { status: 500 });
  }

  const items: string[] = [];

  for (const product of products ?? []) {
    const productUrl = `${storeUrl}/products/${product.slug}`;
    const primaryImage =
      (product.images as string[] | null)?.[0] ?? product.image_url ?? "";
    const additionalImages = ((product.images as string[] | null) ?? []).slice(1);
    const brandName = esc((product.brands as any)?.name || defaultBrand);
    const categoryName = esc((product.categories as any)?.name || "");

    const activeVariants = ((product.product_variants as any[]) ?? []).filter(
      (v: any) => v.is_active
    );

    if (product.has_variants && activeVariants.length > 0) {
      // Her varyant ayrı item — item_group_id ile gruplandır
      for (const variant of activeVariants) {
        const variantValue = esc(variant.variant_options?.value ?? "");
        const groupName = esc(variant.variant_options?.variant_groups?.name ?? "");
        const variantTitle = `${esc(product.title)} - ${variantValue}`;
        const variantUrl = `${productUrl}?variant=${variant.id}`;
        const variantPrice = `${Number(variant.price).toFixed(2)} ${currency}`;

        items.push(`
    <item>
      <g:id>${esc(product.id)}_${esc(variant.id)}</g:id>
      <g:item_group_id>${esc(product.id)}</g:item_group_id>
      <g:title>${variantTitle}</g:title>
      <g:description>${esc(product.description || product.title)}</g:description>
      <g:link>${esc(variantUrl)}</g:link>
      ${primaryImage ? `<g:image_link>${esc(primaryImage)}</g:image_link>` : ""}
      ${additionalImages.map((img: string) => `<g:additional_image_link>${esc(img)}</g:additional_image_link>`).join("\n      ")}
      <g:availability>${availability(variant.stock)}</g:availability>
      <g:price>${variantPrice}</g:price>
      <g:brand>${brandName}</g:brand>
      <g:condition>${esc(condition)}</g:condition>
      ${categoryName ? `<g:product_type>${categoryName}</g:product_type>` : ""}
      ${defaultCategory ? `<g:google_product_category>${esc(defaultCategory)}</g:google_product_category>` : ""}
      ${variant.sku ? `<g:mpn>${esc(variant.sku)}</g:mpn>` : "<g:identifier_exists>no</g:identifier_exists>"}
      ${groupName ? `<g:${groupName.toLowerCase() === "renk" ? "color" : groupName.toLowerCase() === "beden" ? "size" : "material"}>${variantValue}</g:${groupName.toLowerCase() === "renk" ? "color" : groupName.toLowerCase() === "beden" ? "size" : "material"}>` : ""}
    </item>`);
      }
    } else {
      // Varyant'sız tek ürün
      const price = `${Number(product.price).toFixed(2)} ${currency}`;

      items.push(`
    <item>
      <g:id>${esc(product.id)}</g:id>
      <g:title>${esc(product.title)}</g:title>
      <g:description>${esc(product.description || product.title)}</g:description>
      <g:link>${esc(productUrl)}</g:link>
      ${primaryImage ? `<g:image_link>${esc(primaryImage)}</g:image_link>` : ""}
      ${additionalImages.map((img: string) => `<g:additional_image_link>${esc(img)}</g:additional_image_link>`).join("\n      ")}
      <g:availability>${availability(product.stock)}</g:availability>
      <g:price>${price}</g:price>
      <g:brand>${brandName}</g:brand>
      <g:condition>${esc(condition)}</g:condition>
      ${categoryName ? `<g:product_type>${categoryName}</g:product_type>` : ""}
      ${defaultCategory ? `<g:google_product_category>${esc(defaultCategory)}</g:google_product_category>` : ""}
      <g:identifier_exists>no</g:identifier_exists>
    </item>`);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>${esc(storeName)}</title>
    <link>${esc(storeUrl)}</link>
    <description>${esc(storeName)} ürün kataloğu</description>
    ${items.join("")}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=UTF-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=7200",
    },
  });
}
