/**
 * Ürün Beslemesi — Google Merchant Center + Meta (Instagram/Facebook) kataloğu
 * URL: /feed/google-merchant  (Meta için aynısı: /feed/meta)
 *
 * Meta katalog reklamı: Commerce Manager › Katalog › Veri kaynakları › "Planlı besleme" → bu URL.
 * item_group_id = ürün kimliği → Pixel olaylarındaki content_ids (content_type "product_group")
 * ile eşleşir (src/lib/analytics.ts). Numara → g:size, barkod → g:gtin, eski fiyat → g:sale_price.
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

// Açıklama: HTML etiketleri ve fazla boşluk temizlenmiş düz metin (Meta/GMC düz metin ister)
function plain(html: string | null | undefined, max = 4900): string {
  if (!html) return "";
  return html
    .replace(/<(br|\/p|\/li|\/h\d)[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// Varyant grubu → besleme alanı (ayakkabıda "Numara" → size)
function attrTag(groupName: string): "size" | "color" | null {
  const g = groupName.toLocaleLowerCase("tr-TR");
  if (/numara|beden|size|ölçü|olcu/.test(g)) return "size";
  if (/renk|color/.test(g)) return "color";
  return null;
}

// Geçerli GTIN (barkod): 8/12/13/14 hane
function gtin(barcode: string | null | undefined): string | null {
  const d = String(barcode || "").replace(/\s/g, "");
  return /^(\d{8}|\d{12,14})$/.test(d) ? d : null;
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
      id, title, description, short_description, slug, price, stock, images, image_url, has_variants, tags,
      brands (name),
      categories (name),
      product_variants (
        id, sku, barcode, price, compare_at_price, stock, is_active,
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
    const description = esc(plain(product.description) || plain(product.short_description) || product.title);

    const activeVariants = ((product.product_variants as any[]) ?? []).filter(
      (v: any) => v.is_active
    );

    if (product.has_variants && activeVariants.length > 0) {
      // Her varyant ayrı item — item_group_id ile gruplandır
      for (const variant of activeVariants) {
        const variantValue = esc(variant.variant_options?.value ?? "");
        const tag = attrTag(variant.variant_options?.variant_groups?.name ?? "");
        const variantTitle = `${esc(product.title)} - ${variantValue}`;
        const variantUrl = `${productUrl}?variant=${variant.id}`; // ürün sayfası bu numarayı seçili açar
        const onSale = variant.compare_at_price != null && Number(variant.compare_at_price) > Number(variant.price);
        const listPrice = `${Number(onSale ? variant.compare_at_price : variant.price).toFixed(2)} ${currency}`;
        const code = gtin(variant.barcode);

        items.push(`
    <item>
      <g:id>${esc(product.id)}_${esc(variant.id)}</g:id>
      <g:item_group_id>${esc(product.id)}</g:item_group_id>
      <g:title>${variantTitle}</g:title>
      <g:description>${description}</g:description>
      <g:link>${esc(variantUrl)}</g:link>
      ${primaryImage ? `<g:image_link>${esc(primaryImage)}</g:image_link>` : ""}
      ${additionalImages.map((img: string) => `<g:additional_image_link>${esc(img)}</g:additional_image_link>`).join("\n      ")}
      <g:availability>${availability(variant.stock)}</g:availability>
      <g:price>${listPrice}</g:price>
      ${onSale ? `<g:sale_price>${Number(variant.price).toFixed(2)} ${currency}</g:sale_price>` : ""}
      <g:brand>${brandName}</g:brand>
      <g:condition>${esc(condition)}</g:condition>
      ${categoryName ? `<g:product_type>${categoryName}</g:product_type>` : ""}
      ${categoryName ? `<g:custom_label_0>${categoryName}</g:custom_label_0>` : ""}
      ${defaultCategory ? `<g:google_product_category>${esc(defaultCategory)}</g:google_product_category>` : ""}
      ${code ? `<g:gtin>${code}</g:gtin>` : ""}
      ${variant.sku ? `<g:mpn>${esc(variant.sku)}</g:mpn>` : ""}
      ${!code && !variant.sku ? "<g:identifier_exists>no</g:identifier_exists>" : ""}
      ${tag && variantValue ? `<g:${tag}>${variantValue}</g:${tag}>` : ""}
    </item>`);
      }
    } else {
      // Varyant'sız tek ürün
      const price = `${Number(product.price).toFixed(2)} ${currency}`;

      items.push(`
    <item>
      <g:id>${esc(product.id)}</g:id>
      <g:item_group_id>${esc(product.id)}</g:item_group_id>
      <g:title>${esc(product.title)}</g:title>
      <g:description>${description}</g:description>
      <g:link>${esc(productUrl)}</g:link>
      ${primaryImage ? `<g:image_link>${esc(primaryImage)}</g:image_link>` : ""}
      ${additionalImages.map((img: string) => `<g:additional_image_link>${esc(img)}</g:additional_image_link>`).join("\n      ")}
      <g:availability>${availability(product.stock)}</g:availability>
      <g:price>${price}</g:price>
      <g:brand>${brandName}</g:brand>
      <g:condition>${esc(condition)}</g:condition>
      ${categoryName ? `<g:product_type>${categoryName}</g:product_type>` : ""}
      ${categoryName ? `<g:custom_label_0>${categoryName}</g:custom_label_0>` : ""}
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
