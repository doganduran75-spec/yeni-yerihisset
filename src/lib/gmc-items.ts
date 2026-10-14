/* eslint-disable @typescript-eslint/no-explicit-any */
// Google ürün kalemleri — TEK KAYNAK: hem XML beslemesi (/feed/google-merchant, /feed/meta) hem Merchant API
// anlık gönderimi (src/lib/gmc-sync.ts) bu kalemleri kullanır. Kimlik (offerId) ikisinde AYNI olmalı:
// varyantlı ürün "<ürün id>_<varyant id>", varyantsız ürün "<ürün id>" — yoksa Google'da çift ürün oluşur.

import { feedAttrs } from "@/config/product-specs";
import type { createAdminClient } from "@/lib/supabase-admin";
type Sb = ReturnType<typeof createAdminClient>;

export type GmcItem = {
  id: string;
  itemGroupId: string;
  title: string;
  description: string;
  link: string;
  imageLink: string | null;
  additionalImageLinks: string[];
  availability: "in_stock" | "out_of_stock";
  price: number;          // liste fiyatı (indirim varsa eski fiyat)
  salePrice: number | null;
  currency: string;
  brand: string;
  condition: string;
  productType: string | null;
  googleProductCategory: string | null;
  gtin: string | null;
  mpn: string | null;
  identifierExists: boolean;
  variantTag: "size" | "color" | null;
  variantValue: string | null;
  color: string | null;   // ürün adındaki renk (src/config/product-specs.ts)
  gender: string | null;
  ageGroup: string | null;
  material: string | null;
  sizeSystem: string | null;
  highlights: string[];
  details: [string, string][];
};

// Açıklama: HTML etiketleri ve fazla boşluk temizlenmiş düz metin (Meta/GMC düz metin ister)
export function plain(html: string | null | undefined, max = 4900): string {
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
function gtinOf(barcode: string | null | undefined): string | null {
  const d = String(barcode || "").replace(/\s/g, "");
  return /^(\d{8}|\d{12,14})$/.test(d) ? d : null;
}

export async function gmcSettings(sb: Sb) {
  const { data: s } = await (sb as any).from("settings").select("*").order("id").limit(1).maybeSingle();
  return s || {};
}

/** Aktif ürünlerin Google kalemleri. productIds verilirse yalnız onlar (pasif / silinmiş ürün kalem üretmez). */
export async function buildGmcItems(sb: Sb, opts: { productIds?: string[]; settings?: any } = {}): Promise<GmcItem[]> {
  const settings = opts.settings ?? (await gmcSettings(sb));
  const storeName = settings?.store_name || "YeriHisset";
  const storeUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";
  const currency = settings?.currency || "TRY";
  const condition = settings?.gmc_product_condition || "new";
  const defaultBrand = settings?.gmc_brand_default || storeName;
  const defaultCategory = settings?.gmc_default_category || "";

  let q = (sb as any)
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
  if (opts.productIds) q = q.in("id", opts.productIds.length ? opts.productIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data: products, error } = await q;
  if (error) throw new Error(error.message);

  const items: GmcItem[] = [];
  for (const product of (products as any[]) ?? []) {
    const productUrl = `${storeUrl}/products/${product.slug}`;
    const primaryImage = (product.images as string[] | null)?.[0] ?? product.image_url ?? "";
    const additionalImages = ((product.images as string[] | null) ?? []).slice(1);
    const brandName = product.brands?.name || defaultBrand;
    const categoryName = product.categories?.name || "";
    const description = plain(product.description) || plain(product.short_description) || product.title;
    // Renk / cinsiyet / yaş grubu / malzeme / öne çıkanlar / teknik detay (src/config/product-specs.ts)
    const fa = feedAttrs(product.brands?.name, product.title);
    const common = {
      itemGroupId: String(product.id), description, imageLink: primaryImage || null, additionalImageLinks: additionalImages,
      currency, brand: brandName, condition, productType: categoryName || null, googleProductCategory: defaultCategory || null,
      color: fa.color ?? null, gender: fa.gender ?? null, ageGroup: fa.ageGroup ?? null, material: fa.material ?? null,
      highlights: fa.highlights.map((h) => h.slice(0, 150)), details: fa.details as [string, string][],
    };
    const activeVariants = ((product.product_variants as any[]) ?? []).filter((v: any) => v.is_active);

    if (product.has_variants && activeVariants.length > 0) {
      // Her varyant ayrı kalem — item_group_id ile gruplandır
      for (const variant of activeVariants) {
        const value = variant.variant_options?.value ?? "";
        const tag = attrTag(variant.variant_options?.variant_groups?.name ?? "");
        const onSale = variant.compare_at_price != null && Number(variant.compare_at_price) > Number(variant.price);
        const code = gtinOf(variant.barcode);
        items.push({
          ...common,
          id: `${product.id}_${variant.id}`,
          title: `${product.title} - ${value}`,
          link: `${productUrl}?variant=${variant.id}`, // ürün sayfası bu numarayı seçili açar
          availability: (variant.stock ?? 0) > 0 ? "in_stock" : "out_of_stock",
          price: Number(onSale ? variant.compare_at_price : variant.price),
          salePrice: onSale ? Number(variant.price) : null,
          gtin: code, mpn: variant.sku || null, identifierExists: !!(code || variant.sku),
          variantTag: tag, variantValue: value || null,
          sizeSystem: tag === "size" ? fa.sizeSystem ?? null : null,
        });
      }
    } else {
      items.push({
        ...common,
        id: String(product.id),
        title: product.title,
        link: productUrl,
        availability: (product.stock ?? 0) > 0 ? "in_stock" : "out_of_stock",
        price: Number(product.price), salePrice: null,
        gtin: null, mpn: null, identifierExists: false,
        variantTag: null, variantValue: null, sizeSystem: null,
      });
    }
  }
  return items;
}
