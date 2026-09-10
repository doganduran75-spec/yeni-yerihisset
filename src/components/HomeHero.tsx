"use client";

import Link from "next/link";
import { Footprints, ShoppingBag, ArrowRight, ChevronDown } from "lucide-react";
import { track } from "@/lib/track";

/**
 * Ana sayfa karşılama terminali (popup yerine). Tam ekran, iki segmentasyon
 * kartı: Keşif (Barefoot nedir?) ve Mağaza. "Zaten biliyorum" ile aşağı kayar.
 * Görsel-temel; her kartın arka planına gerçek fotoğraf koymak için CARD_BG'yi
 * (aşağıda) bir görsel URL'iyle değiştir — boşsa degrade gösterilir.
 */
const KESIF_BG = ""; // ör: "/hero-barefoot.jpg" (doğal zeminde çıplak ayak)
const MAGAZA_BG = ""; // ör: "/hero-dodura.jpg" (popüler model ürün çekimi)

export default function HomeHero() {
  return (
    <section className="relative">
      <div className="grid md:grid-cols-2 min-h-[calc(100vh-6rem)]">
        {/* SOL — Keşif */}
        <Link
          href="/barefoot-nedir"
          onClick={() => track("hero_click", { side: "kesif", to: "/barefoot-nedir" })}
          className="group relative flex flex-col justify-center items-start gap-5 p-8 md:p-14 overflow-hidden bg-gradient-to-br from-olive-700 to-olive-900 text-white min-h-[45vh] md:min-h-0"
          style={KESIF_BG ? { backgroundImage: `url(${KESIF_BG})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        >
          {KESIF_BG && <div className="absolute inset-0 bg-black/45 group-hover:bg-black/35 transition-colors" />}
          <div className="relative z-10 max-w-md">
            <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center mb-5">
              <Footprints size={28} />
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/70 mb-2">Keşfet</p>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight italic leading-tight mb-3">
              Barefoot nedir<br />merak ettim
            </h2>
            <p className="text-sm md:text-base text-white/80 leading-relaxed mb-6">
              Çıplak ayak ayakkabı nedir, ayağına ne yapar? Kısaca anlatalım — sonra rahatça seçersin.
            </p>
            <span className="inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-white text-olive-800 font-black text-sm uppercase tracking-widest group-hover:gap-3 transition-all">
              Öğrenmeye Başla <ArrowRight size={18} />
            </span>
          </div>
        </Link>

        {/* SAĞ — Mağaza */}
        <Link
          href="/products"
          onClick={() => track("hero_click", { side: "magaza", to: "/products" })}
          className="group relative flex flex-col justify-center items-start gap-5 p-8 md:p-14 overflow-hidden bg-gradient-to-br from-slate-50 to-slate-200 text-slate-900 min-h-[45vh] md:min-h-0 border-t md:border-t-0 md:border-l border-slate-200"
          style={MAGAZA_BG ? { backgroundImage: `url(${MAGAZA_BG})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        >
          {MAGAZA_BG && <div className="absolute inset-0 bg-white/30 group-hover:bg-white/20 transition-colors" />}
          <div className="relative z-10 max-w-md">
            <div className="w-14 h-14 rounded-2xl bg-olive-600 text-white flex items-center justify-center mb-5">
              <ShoppingBag size={26} />
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-olive-600 mb-2">Vitrin</p>
            <h2 className="text-3xl md:text-4xl font-black tracking-tight italic leading-tight mb-3">
              Modeli beğendim<br />mağazaya git
            </h2>
            <p className="text-sm md:text-base text-slate-500 leading-relaxed mb-6">
              Numaranı seç, stoktaki modellere göz at, tek tıkla sipariş ver. Sıfır sürtünme.
            </p>
            <span className="inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-olive-600 text-white font-black text-sm uppercase tracking-widest group-hover:gap-3 group-hover:bg-olive-700 transition-all">
              Mağazaya Git <ArrowRight size={18} />
            </span>
          </div>
        </Link>
      </div>

      {/* Zaten biliyorum → aşağı kaydır */}
      <a
        href="#anasayfa-devam"
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1 text-slate-500 hover:text-olive-600 transition-colors"
      >
        <span className="text-[11px] font-black uppercase tracking-widest bg-white/90 backdrop-blur px-3 py-1.5 rounded-full shadow-sm border border-slate-100">
          Zaten biliyorum, keşfet
        </span>
        <ChevronDown size={20} className="animate-bounce" />
      </a>
    </section>
  );
}
