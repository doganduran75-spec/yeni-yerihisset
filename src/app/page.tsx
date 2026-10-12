import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import HomeClient from "./HomeClient";
import { getHomeContent } from "@/lib/home-content";

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

export default async function HomePage() {
  const [products, content] = await Promise.all([getFeaturedProducts(), getHomeContent()]);
  return <HomeClient initialProducts={products} content={content} />;
}
