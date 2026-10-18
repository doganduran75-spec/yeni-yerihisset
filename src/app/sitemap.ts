import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";

export const revalidate = 3600; // saatte bir yeniden oluştur

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Aktif ürünler + kategori / marka / bilgi bankası (arama motoru ve yapay zekâ tarayıcıları bu listeden keşfeder)
  const [{ data: products }, { data: cats }, { data: brands }, { data: kb }, { data: pages }] = await Promise.all([
    supabase.from("products").select("slug, updated_at, category_id, brand_id").eq("is_active", true).order("updated_at", { ascending: false }),
    (supabase as any).from("categories").select("id, slug, updated_at, segment"),
    supabase.from("brands").select("id, slug"),
    (supabase as any).from("kb_articles").select("slug, updated_at, created_at"),
    // Yayındaki düzenlenebilir sayfalar (hukuki + Hakkımızda; taslaklar herkese açık değil → gelmez)
    (supabase as any).from("static_pages").select("slug, updated_at"),
  ]);
  // Yalnız aktif ürünü olan kategori / markalar (boş liste sayfası dizine girmesin)
  const usedCats = new Set((products ?? []).map((p: any) => p.category_id).filter(Boolean));
  const usedBrands = new Set((products ?? []).map((p: any) => p.brand_id).filter(Boolean));
  const listUrls: MetadataRoute.Sitemap = [
    // İlkadım'ın tek kategorisi /magaza/ilkadim'e yönlenir → listede olmaz (yönlenen adres site haritasına girmez)
    ...((cats ?? []) as any[]).filter((c) => usedCats.has(c.id) && c.slug
      && !(c.segment === "ilkadim" && ((cats ?? []) as any[]).filter((x) => x.segment === "ilkadim").length <= 1)).map((c) => ({
      url: `${SITE_URL}/kategori/${c.slug}`, lastModified: c.updated_at ? new Date(c.updated_at) : new Date(), changeFrequency: "weekly" as const, priority: 0.8,
    })),
    ...((brands ?? []) as any[]).filter((b) => usedBrands.has(b.id) && b.slug).map((b) => ({
      url: `${SITE_URL}/marka/${b.slug}`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 0.7,
    })),
  ];
  // "barefoot-ayakkabi-nedir" yazısı /barefoot-nedir ana rehberine yönlendiriliyor (next.config) → haritada yönlendirilen adres olmasın
  const kbUrls: MetadataRoute.Sitemap = ((kb ?? []) as any[]).filter((a) => a.slug && a.slug !== "barefoot-ayakkabi-nedir").map((a) => ({
    url: `${SITE_URL}/bilgi-bankasi/${a.slug}`,
    lastModified: new Date(a.updated_at || a.created_at || Date.now()),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const productUrls: MetadataRoute.Sitemap = (products ?? []).map((p) => ({
    url: `${SITE_URL}/products/${p.slug}`,
    lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // Statik sayfalar
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/magaza`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    // Segment mağazaları (Yetişkin / 0–4 Yaş İlkadım)
    { url: `${SITE_URL}/magaza/yetiskin`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/magaza/ilkadim`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/barefoot-nedir`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/bilgi-bankasi`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/firsatlar`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.5 },
    {
      url: `${SITE_URL}/affiliate`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    // Hukuki sayfalar + Hakkımızda: Ayarlar › Sayfalar'da "Taslak" işareti kalkınca haritaya girer
    ...((pages ?? []) as any[]).filter((p) => p.slug !== "barefoot-nedir").map((p) => ({ url: `${SITE_URL}/${p.slug}`, lastModified: new Date(p.updated_at), changeFrequency: "yearly" as const, priority: 0.3 })),
  ];

  return [...staticPages, ...listUrls, ...productUrls, ...kbUrls];
}
