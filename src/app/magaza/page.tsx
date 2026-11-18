import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SegmentChooser from "@/components/SegmentChooser";
import type { Segment } from "@/config/segments";
import { createAdminClient } from "@/lib/supabase-admin";

// MAĞAZA = SEÇİM EKRANI (kullanıcı kararları 2026-10-18): Yetişkin / 0–4 Yaş İlkadım. Ürünler segment
// mağazalarında (/magaza/yetiskin, /magaza/ilkadim). Eski sitenin Google'daki /magaza/ kaydı bu sayfaya gelir.
// 60 sn (kullanıcı 2026-11-18): panelde kart görseli değişince 5 dk boyunca eski görsel de çıkıyordu — site 4 süreçle
// çalışıyor (pm2 cluster), her sürecin önbelleği ayrı tazelenir; ana sayfa gibi ~1 dk içinde hepsi yeni görseli gösterir
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Barefoot Ayakkabı Mağazası — Yetişkin ve 0–4 Yaş İlkadım",
  description: "Yetişkin barefoot ayakkabı, babet ve botlar ya da 0–4 yaş ilk adım ve bebek barefoot ayakkabıları. Geniş burun, sıfır topuk farkı, esnek taban; 14 gün evde dene.",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com"}/magaza` },
};

// Her segmentin kartı: panelde seçilen kapaklar (Ayarlar › Kategoriler › Mağaza kartları, en çok 3, ziyarette biri;
// settings.segment_covers, MIG 20261195 — anon'a kapalı kolon, yönetici istemcisiyle okunur); seçilmemişse stoktaki bir ürün
async function segmentImages(): Promise<Partial<Record<Segment, string | string[] | null>>> {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const out: Partial<Record<Segment, string | string[] | null>> = {};
  let chosen: any = {};
  try {
    const { data: st } = await (createAdminClient() as any).from("settings").select("segment_covers").order("id").limit(1).maybeSingle();
    chosen = st?.segment_covers || {};
  } catch { chosen = {}; }
  for (const seg of ["yetiskin", "ilkadim"] as Segment[]) {
    const picked = (Array.isArray(chosen?.[seg]) ? chosen[seg] : []).filter((s: unknown) => typeof s === "string" && s).slice(0, 3);
    if (picked.length) { out[seg] = picked; continue; }
    const { data } = await (sb as any).from("products")
      .select("images, image_url, stock, categories!inner(segment), product_variants(stock, is_active)")
      .eq("is_active", true).eq("categories.segment", seg).order("created_at", { ascending: false }).limit(20);
    const rows = (data as any[]) || [];
    const inStock = (p: any) => Number(p.stock || 0) > 0 || (p.product_variants || []).some((v: any) => v.is_active !== false && Number(v.stock || 0) > 0);
    const pick = rows.find((p) => inStock(p) && (p.images?.[0] || p.image_url)) || rows.find((p) => p.images?.[0] || p.image_url);
    out[seg] = pick ? (pick.images?.[0] || pick.image_url) : null;
  }
  return out;
}

export default async function MagazaPage() {
  const images = await segmentImages();
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <header className="mb-6">
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Barefoot Ayakkabı Mağazası</h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">Kimin için bakıyorsun? Yetişkinler için Dodura, ilk adımlar için Attipas. Numaranı seç, stoktakileri gör; 14 gün evde dene.</p>
          </header>
          <SegmentChooser images={images} source="magaza_sayfasi" />
        </div>
      </main>
      <Footer />
    </>
  );
}
