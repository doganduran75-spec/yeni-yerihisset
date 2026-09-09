import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SizeFilterGrid from "@/components/SizeFilterGrid";
import FeedbackForm from "@/components/FeedbackForm";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Tüm Ürünler",
  description: "Tüm ürünlerimizi keşfedin.",
};

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export default async function ProductsPage() {
  const sb = getSupabase();

  const { data: products } = await sb
    .from("products")
    .select(`
      id, title, slug, price, images, image_url, has_variants,
      categories(id, name, slug),
      brands(name, slug),
      product_variants(id, price, is_active, stock, variant_options(value, variant_groups(name)))
    `)
    .eq("is_active", true)
    .not("category_id", "is", null)
    .order("created_at", { ascending: false });

  // Kategorisiz ürünler bu sayfada gösterilmez (silinen kategori kenar durumu
  // için embed de kontrol edilir).
  const list = ((products ?? []) as any[]).filter((p) => p.categories?.id);

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          {/* Ürün grid + numara filtresi */}
          <SizeFilterGrid products={list} />

          {/* Aradığını bulamadın mı? — talep yakalama */}
          <FeedbackForm source="products" />
        </div>
      </main>
      <Footer />
    </>
  );
}
