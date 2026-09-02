import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SizeFilterGrid from "@/components/SizeFilterGrid";
import { ChevronRight } from "lucide-react";

export const revalidate = 60;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const sb = getSupabase();
  const { data: cat } = await sb.from("categories").select("name").eq("slug", slug).single();
  return {
    title: cat?.name ?? "Kategori",
    description: `${cat?.name ?? "Kategori"} kategorisindeki tüm ürünler`,
  };
}

export default async function KategoriPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sb = getSupabase();

  const { data: category } = await sb
    .from("categories")
    .select("id, name, slug")
    .eq("slug", slug)
    .single();

  if (!category) notFound();

  const { data: products } = await sb
    .from("products")
    .select(`
      id, title, slug, price, images, image_url, has_variants,
      brands(name, slug),
      product_variants(price, is_active, stock, variant_options(value, variant_groups(name)))
    `)
    .eq("category_id", category.id)
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
            <span className="text-slate-900 font-medium">{category.name}</span>
          </nav>

          {/* Başlık */}
          <div className="mb-10">
            <h1 className="text-4xl font-black tracking-tight text-slate-900 uppercase italic">
              {category.name}
            </h1>
            <p className="text-slate-400 mt-1 text-sm">{list.length} ürün</p>
          </div>

          {/* Ürün grid + numara filtresi */}
          <SizeFilterGrid products={list} categoryName={category.name} />
        </div>
      </main>
      <Footer />
    </>
  );
}
