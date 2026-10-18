import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import HomeClient from "./HomeClient";
import { getHomeContent } from "@/lib/home-content";
import type { CategoryTile } from "@/components/HomeCategories";
import { getVariantPriceRange } from "@/lib/product-price";

export const metadata: Metadata = { alternates: { canonical: "/" } };

// ISR: ana sayfa artık SUNUCUDA render edilir ve önbelleklenir, 5 dakikada bir
// tazelenir. Öne çıkan ürünler sunucuda çekilir → her ziyaretçinin tarayıcısı
// ayrı Supabase sorgusu atmaz, ilk boyama hızlanır, ürünler HTML'de (SEO).
export const revalidate = 60; // panelde değişen ana sayfa metni ~1 dk içinde yayında

async function getFeaturedProducts() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data } = await sb
    .from("products")
    .select("*, brands(name), categories(name), product_variants(price, is_active)")
    .eq("is_active", true)
    .limit(8);
  return data || [];
}

// Kategori kutuları: her kategoriden stoktaki bir ürün görseli → segment mağazasında o kategori açılır.
// Sıra: Yetişkin kategorileri (ürün sayısına göre), sonra İlkadım. İlkadım'ın tek kategorisi varsa /magaza/ilkadim.
async function getCategoryTiles(): Promise<CategoryTile[]> {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data } = await (sb as any).from("products")
    .select("images, image_url, stock, price, has_variants, categories!inner(id, name, slug, segment), product_variants(stock, is_active, price)")
    .eq("is_active", true).order("created_at", { ascending: false }).limit(300);
  const inStock = (p: any) => Number(p.stock || 0) > 0 || (p.product_variants || []).some((v: any) => v.is_active !== false && Number(v.stock || 0) > 0);
  const img = (p: any) => p.images?.[0] || p.image_url || null;
  const by = new Map<string, { c: any; n: number; stockImg: string | null; anyImg: string | null; min: number; max: number }>();
  for (const p of (data as any[]) || []) {
    const c = p.categories;
    if (!c?.id) continue;
    const e = by.get(c.id) || { c, n: 0, stockImg: null, anyImg: null, min: Infinity, max: 0 };
    e.n++;
    // Fiyat aralığı: aktif varyant fiyatları (yoksa ürün fiyatı)
    const r = getVariantPriceRange(p);
    if (r.min > 0) { e.min = Math.min(e.min, r.min); e.max = Math.max(e.max, r.max); }
    if (!e.stockImg && inStock(p) && img(p)) e.stockImg = img(p);
    if (!e.anyImg && img(p)) e.anyImg = img(p);
    by.set(c.id, e);
  }
  const all = [...by.values()];
  const ilkCount = all.filter((e) => e.c.segment === "ilkadim").length;
  return all
    .sort((a, b) => (a.c.segment === b.c.segment ? b.n - a.n : a.c.segment === "yetiskin" ? -1 : 1))
    .map((e) => {
      const seg = e.c.segment === "ilkadim" ? "ilkadim" : "yetiskin";
      const href = seg === "ilkadim" && ilkCount <= 1 ? "/magaza/ilkadim" : `/magaza/${seg}?kategori=${encodeURIComponent(e.c.slug)}`;
      return { id: e.c.id, name: e.c.name, href, image: e.stockImg || e.anyImg, segment: seg, min: Number.isFinite(e.min) ? e.min : null, max: e.max || null };
    });
}

export default async function HomePage() {
  const [products, content, tiles] = await Promise.all([getFeaturedProducts(), getHomeContent(), getCategoryTiles().catch(() => [])]);
  return <HomeClient initialProducts={products} content={content} tiles={tiles} />;
}
