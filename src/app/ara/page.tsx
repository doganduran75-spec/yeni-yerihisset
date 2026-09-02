import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ChevronRight, Search, Star } from "lucide-react";
import { formatPriceDisplay, getMinPrice } from "@/lib/product-price";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Arama",
  robots: { index: false, follow: true },
};

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Türkçe-duyarsız normalize
function norm(s: string): string {
  return (s || "")
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i").replaceAll("İ", "i")
    .replaceAll("ş", "s").replaceAll("ğ", "g")
    .replaceAll("ü", "u").replaceAll("ö", "o").replaceAll("ç", "c");
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  const tokens = norm(query).split(/\s+/).filter(Boolean);

  let list: any[] = [];
  if (tokens.length > 0) {
    const sb = getSupabase();
    const { data: products } = await sb
      .from("products")
      .select(`
        id, title, slug, price, images, image_url, has_variants,
        categories(name),
        brands(name, slug),
        product_variants(price, is_active, variant_options(value, variant_groups(name)))
      `)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    const all = (products ?? []) as any[];
    list = all.filter((p) => {
      const variantText = (p.product_variants ?? [])
        .map((v: any) => `${v.variant_options?.value ?? ""} ${v.variant_options?.variant_groups?.name ?? ""}`)
        .join(" ");
      const hay = norm([
        p.title,
        (p.brands as any)?.name,
        (p.categories as any)?.name,
        variantText,
      ].filter(Boolean).join(" "));
      return tokens.every((t) => hay.includes(t));
    });
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-8">
            <Link href="/" className="hover:text-olive-600">Anasayfa</Link>
            <ChevronRight size={14} />
            <span className="text-slate-900 font-medium">Arama</span>
          </nav>

          <div className="mb-10">
            <h1 className="text-4xl font-black tracking-tight text-slate-900 uppercase italic">
              {query ? <>“{query}” için sonuçlar</> : "Ürün Ara"}
            </h1>
            {query && <p className="text-slate-400 mt-1 text-sm">{list.length} ürün bulundu</p>}
          </div>

          {!query ? (
            <div className="text-center py-20 text-slate-400">
              Aramak istediğiniz ürünü üstteki arama kutusuna yazın. Örnek: <b>bot siyah</b>, <b>sandalet 40</b>.
            </div>
          ) : list.length === 0 ? (
            <div className="text-center py-20 text-slate-400 space-y-3">
              <p>“{query}” için ürün bulunamadı.</p>
              <Link href="/products" className="inline-block text-olive-600 font-bold hover:underline">
                Tüm ürünlere göz at →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-16">
              {list.map((product) => {
                const img =
                  product.images?.[0] ?? product.image_url ??
                  "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?q=80&w=400";
                const minPrice = getMinPrice(product);
                const priceText = formatPriceDisplay(product);
                const brand = product.brands as any;
                const cat = product.categories as any;

                return (
                  <div key={product.id} className="group cursor-pointer">
                    <div className="relative aspect-[3/4] overflow-hidden rounded-[2.5rem] bg-olive-50 mb-6 border border-slate-100 shadow-sm transition-all duration-700 hover:shadow-2xl hover:shadow-slate-200">
                      <Link href={`/products/${product.slug}`} className="block w-full h-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img}
                          alt={product.title}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000"
                        />
                      </Link>
                      <Link
                        href={`/products/${product.slug}`}
                        className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[85%] h-14 glass rounded-2xl text-slate-900 font-black text-xs uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all transform translate-y-4 group-hover:translate-y-0 flex items-center justify-center gap-2 hover:bg-olive-600 hover:text-white hover:border-olive-600 active:scale-95 shadow-xl"
                      >
                        <Search size={18} /> İNCELE
                      </Link>
                      <div className="absolute top-6 left-6 flex flex-col gap-2">
                        {brand?.name && (
                          <span className="px-3 py-1 bg-white/90 backdrop-blur-md text-[9px] font-black uppercase tracking-widest rounded-full border border-slate-100 text-slate-900">
                            {brand.name}
                          </span>
                        )}
                        {minPrice > 1000 && (
                          <span className="px-3 py-1 bg-olive-600 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-olive-100">
                            Ücretsiz Kargo
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1 px-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.1em]">
                          {cat?.name ?? ""}
                        </p>
                        <div className="flex items-center gap-1 text-yellow-400">
                          <Star size={10} fill="currentColor" />
                          <span className="text-[10px] text-slate-500 font-bold italic">4.9 (124+)</span>
                        </div>
                      </div>
                      <Link href={`/products/${product.slug}`}>
                        <h3 className="text-lg font-black text-slate-900 group-hover:text-olive-600 transition-colors tracking-tight uppercase italic">
                          {product.title}
                        </h3>
                      </Link>
                      <p className="font-black text-2xl text-olive-600 italic tracking-tighter">
                        {priceText}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
