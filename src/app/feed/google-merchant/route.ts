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
import { buildGmcItems, gmcSettings, type GmcItem } from "@/lib/gmc-items";

// Kalemler src/lib/gmc-items.ts'te (Merchant API anlık gönderimiyle aynı kaynak / aynı kimlikler)

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

function itemXml(it: GmcItem): string {
  const extra = [
    it.color ? `<g:color>${esc(it.color)}</g:color>` : "",
    it.gender ? `<g:gender>${it.gender}</g:gender>` : "",
    it.ageGroup ? `<g:age_group>${it.ageGroup}</g:age_group>` : "",
    it.material ? `<g:material>${esc(it.material)}</g:material>` : "",
    ...it.highlights.map((h) => `<g:product_highlight>${esc(h)}</g:product_highlight>`),
    ...it.details.map(([k, v]) => `<g:product_detail><g:section_name>Teknik bilgiler</g:section_name><g:attribute_name>${esc(k)}</g:attribute_name><g:attribute_value>${esc(v)}</g:attribute_value></g:product_detail>`),
  ].filter(Boolean).join("\n      ");
  const value = esc(it.variantValue);
  const cat = esc(it.productType);
  return `
    <item>
      <g:id>${esc(it.id)}</g:id>
      <g:item_group_id>${esc(it.itemGroupId)}</g:item_group_id>
      <g:title>${esc(it.title)}</g:title>
      <g:description>${esc(it.description)}</g:description>
      <g:link>${esc(it.link)}</g:link>
      ${it.imageLink ? `<g:image_link>${esc(it.imageLink)}</g:image_link>` : ""}
      ${it.additionalImageLinks.map((img) => `<g:additional_image_link>${esc(img)}</g:additional_image_link>`).join("\n      ")}
      <g:availability>${it.availability}</g:availability>
      <g:price>${it.price.toFixed(2)} ${it.currency}</g:price>
      ${it.salePrice != null ? `<g:sale_price>${it.salePrice.toFixed(2)} ${it.currency}</g:sale_price>` : ""}
      <g:brand>${esc(it.brand)}</g:brand>
      <g:condition>${esc(it.condition)}</g:condition>
      ${cat ? `<g:product_type>${cat}</g:product_type>` : ""}
      ${cat ? `<g:custom_label_0>${cat}</g:custom_label_0>` : ""}
      ${it.googleProductCategory ? `<g:google_product_category>${esc(it.googleProductCategory)}</g:google_product_category>` : ""}
      ${it.gtin ? `<g:gtin>${it.gtin}</g:gtin>` : ""}
      ${it.mpn ? `<g:mpn>${esc(it.mpn)}</g:mpn>` : ""}
      ${!it.identifierExists ? "<g:identifier_exists>no</g:identifier_exists>" : ""}
      ${it.variantTag && value ? `<g:${it.variantTag}>${value}</g:${it.variantTag}>` : ""}
      ${it.sizeSystem ? `<g:size_system>${it.sizeSystem}</g:size_system>` : ""}
      ${extra}
    </item>`;
}

export async function GET(request: NextRequest) {
  const supabase = createAdminClient();

  // Feed güvenliği: opsiyonel secret kontrolü
  const settings = await gmcSettings(supabase);
  const feedSecret = settings?.gmc_feed_secret;
  if (feedSecret) {
    const secret = request.nextUrl.searchParams.get("secret");
    if (secret !== feedSecret) {
      return new Response("Yetkisiz", { status: 401 });
    }
  }

  const storeName = settings?.store_name || "YeriHisset";
  const storeUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";

  let items: GmcItem[];
  try {
    items = await buildGmcItems(supabase, { settings });
  } catch (error) {
    console.error("GMC feed error:", error);
    return new Response("Feed oluşturulurken hata oluştu", { status: 500 });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>${esc(storeName)}</title>
    <link>${esc(storeUrl)}</link>
    <description>${esc(storeName)} ürün kataloğu</description>
    ${items.map(itemXml).join("")}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=UTF-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=7200",
    },
  });
}
