import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SizeFilterGrid from "@/components/SizeFilterGrid";
import { ChevronRight } from "lucide-react";

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
      categories(name),
      brands(name, slug),
      product_variants(price, is_active, stock, variant_options(value, variant_groups(name)))
    `)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  const list = (products ?? []) as any[];

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-8">
            <Link href="/" className="hover:text-olive-600">Anasayfa</Link>
            <ChevronRight size={14} />
            <span className="text-slate-900 font-medium">Tüm Ürünler</span>
          </nav>

          {/* Başlık */}
          <div className="mb-10">
            <h1 className="text-4xl font-black tracking-tight text-slate-900 uppercase italic">
              Tüm Ürünler
            </h1>
            <p className="text-slate-400 mt-1 text-sm">{list.length} ürün</p>
          </div>

          {/* Ürün grid + numara filtresi */}
          <SizeFilterGrid products={list} />
        </div>
      </main>
      <Footer />
    </>
  );
}
