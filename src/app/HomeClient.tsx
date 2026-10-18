"use client";

import Navbar from "@/components/Navbar";
import MobileHome from "@/components/MobileHome";
import DesktopHome from "@/components/DesktopHome";
import { HomeContentProvider } from "@/lib/home-content-context";
import type { HomeContent } from "@/config/homeContent";
import type { CategoryTile } from "@/components/HomeCategories";
import PrincipleStories from "@/components/PrincipleStories";

// Ana sayfanın etkileşimli (client) kısmı. Ürünler SUNUCUDAN prop olarak gelir
// (ISR ile önbelleklenir) — böylece ilk boyamada ürünler hazır, tarayıcı ayrıca
// Supabase'e sorgu atmaz, SEO için ürünler HTML'de olur.
export default function HomeClient({ initialProducts, content, tiles = [] }: { initialProducts: any[]; content?: HomeContent; tiles?: CategoryTile[] }) {
  const products = initialProducts || [];
  return (
    <div className="min-h-screen" style={{ background: "#FCFAF6" }}>
      <Navbar />

      {/* Tek, SEO-odaklı H1 (görünmez) — hero başlıkları h2; sayfada tek h1 kalır */}
      <h1 className="sr-only">YeriHisset — Doğal Barefoot Ayakkabılar: Geniş Burun, Sıfır Topuk Farkı</h1>

      <HomeContentProvider value={content}>
        {/* Mobil: app-benzeri ana sayfa */}
        <MobileHome products={products} tiles={tiles} />
        {/* Telefonda ilk ziyarette tam ekran prensip hikâyesi (yalnız ana sayfa, reklam parametresi yokken) */}
        <PrincipleStories />

        {/* Masaüstü: DESIGN.md ana sayfa (kendi footer'ıyla) */}
        <div className="hidden md:block">
          <DesktopHome tiles={tiles} />
        </div>
      </HomeContentProvider>

    </div>
  );
}
