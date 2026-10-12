import { createClient } from "@supabase/supabase-js";
import { getFreeShippingOver } from "@/lib/free-shipping-rule";
import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SizeFilterGrid from "@/components/SizeFilterGrid";
import FeedbackForm from "@/components/FeedbackForm";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Tüm Ürünler",
  description: "Tüm barefoot ayakkabı modellerini keşfedin — geniş burun, sıfır topuk farkı, esnek taban.",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com"}/magaza` },
};

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export default async function ProductsPage() {
  const freeOver = await getFreeShippingOver();
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
          {/* Sayfanın tek H1'i + kısa tanım (arama motoru / yapay zekâ "bu sayfa ne?" sorusunu buradan anlar) */}
          <header className="mb-6">
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Barefoot Ayakkabı Mağazası</h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">Geniş burunlu, sıfır topuk farklı, esnek ince tabanlı barefoot ayakkabılar: yetişkinler için Dodura, ilk adımlar için Attipas. Numaranı seç, stoktakileri gör; 14 gün evde dene.</p>
          </header>
          {/* Ürün grid + numara filtresi */}
          <SizeFilterGrid products={list} freeOver={freeOver} />

          {/* Aradığını bulamadın mı? — talep yakalama */}
          <FeedbackForm source="products" />
        </div>
      </main>
      <Footer />
    </>
  );
}
