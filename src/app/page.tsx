import { createClient } from "@supabase/supabase-js";
import HomeClient from "./HomeClient";

// ISR: ana sayfa artık SUNUCUDA render edilir ve önbelleklenir, 5 dakikada bir
// tazelenir. Öne çıkan ürünler sunucuda çekilir → her ziyaretçinin tarayıcısı
// ayrı Supabase sorgusu atmaz, ilk boyama hızlanır, ürünler HTML'de (SEO).
export const revalidate = 300;

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
  const products = await getFeaturedProducts();
  return <HomeClient initialProducts={products} />;
}
