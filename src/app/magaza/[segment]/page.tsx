import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ArrowRightLeft } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SizeFilterGrid from "@/components/SizeFilterGrid";
import FeedbackForm from "@/components/FeedbackForm";
import { getFreeShippingOver } from "@/lib/free-shipping-rule";
import { SEGMENTS, isSegment, otherSegment, type Segment } from "@/config/segments";

// SEGMENT MAĞAZASI: /magaza/yetiskin, /magaza/ilkadim (kullanıcı kararları 2026-10-18). Önce numara, sonra kategori;
// marka süzgeci yalnız segmentte iki marka varsa görünür. Kategori → segment: categories.segment (Ayarlar › Kategoriler).
// Reklam linkleri doğrudan buraya verilir (araya giriş ekranı girmez).
export const revalidate = 300;
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";

export function generateStaticParams() {
  return [{ segment: "yetiskin" }, { segment: "ilkadim" }];
}

export async function generateMetadata({ params }: { params: Promise<{ segment: string }> }): Promise<Metadata> {
  const { segment } = await params;
  if (!isSegment(segment)) return {};
  const S = SEGMENTS[segment];
  return { title: S.title, description: S.intro, alternates: { canonical: `${SITE}${S.path}` } };
}

export default async function SegmentPage({ params }: { params: Promise<{ segment: string }> }) {
  const { segment } = await params;
  if (!isSegment(segment)) notFound();
  const seg: Segment = segment;
  const S = SEGMENTS[seg];
  const other = SEGMENTS[otherSegment(seg)];
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const [freeOver, { data: products }] = await Promise.all([
    getFreeShippingOver(),
    (sb as any).from("products")
      .select(`
        id, title, slug, price, stock, images, image_url, has_variants,
        categories!inner(id, name, slug, segment),
        brands(name, slug),
        product_variants(id, price, is_active, stock, variant_options(value, variant_groups(name)))
      `)
      .eq("is_active", true)
      .eq("categories.segment", seg)
      .order("created_at", { ascending: false }),
  ]);
  const list = ((products ?? []) as any[]).filter((p) => p.categories?.id);

  // Gezinti yolu (Google / yapay zekâ için de)
  const crumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "Ana Sayfa", item: `${SITE}/` },
    { "@type": "ListItem", position: 2, name: "Mağaza", item: `${SITE}/magaza` },
    { "@type": "ListItem", position: 3, name: S.label, item: `${SITE}${S.path}` },
  ] };

  return (
    <>
      <Navbar />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs).replace(/</g, "\\u003c") }} />
      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <nav className="flex items-center gap-1.5 text-sm text-slate-500">
              <Link href="/" className="hover:text-olive-600">Ana Sayfa</Link>
              <ChevronRight size={14} />
              <Link href="/magaza" className="hover:text-olive-600">Mağaza</Link>
              <ChevronRight size={14} />
              <span className="text-slate-900 font-medium">{S.label}</span>
            </nav>
            {/* Diğer segmente geçiş (herkes alt menüyü düşünmez) */}
            <Link href={other.path} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 h-8 text-sm font-semibold text-olive-700 hover:border-olive-300">
              <ArrowRightLeft size={14} /> {other.goTo}
            </Link>
          </div>
          <header className="mb-6">
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">{S.h1}</h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">{S.intro}</p>
          </header>
          <SizeFilterGrid products={list} freeOver={freeOver} segment={seg} />
          <FeedbackForm source={`magaza_${seg}`} />
        </div>
      </main>
      <Footer />
    </>
  );
}
