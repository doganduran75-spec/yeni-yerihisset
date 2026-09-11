import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Heart, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Favorilerim",
  robots: { index: false, follow: true },
};

// Placeholder — favori/beğeni özelliği henüz kurulmadı; alt menüdeki sekme
// 404 olmasın diye nazik bir "yakında" ekranı.
export default function FavorilerPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-[60vh] bg-cream flex items-center">
        <div className="container mx-auto px-4 max-w-md text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-olive-50 text-olive-600 flex items-center justify-center mx-auto mb-6">
            <Heart size={30} />
          </div>
          <h1 className="text-3xl font-black tracking-tight italic text-slate-900 mb-3">Favorilerim</h1>
          <p className="text-slate-500 mb-8 leading-relaxed">
            Beğendiğin modelleri buraya kaydedebileceğin favoriler özelliği çok yakında.
            Şimdilik mağazadan keşfetmeye devam et.
          </p>
          <Link
            href="/products"
            className="inline-flex items-center gap-2 h-13 px-7 py-3.5 rounded-2xl bg-olive-600 hover:bg-olive-700 text-white font-black text-sm uppercase tracking-widest transition-all active:scale-95"
          >
            Mağazaya Git <ArrowRight size={18} />
          </Link>
        </div>
      </main>
      <div className="hidden md:block">
        <Footer />
      </div>
    </>
  );
}
