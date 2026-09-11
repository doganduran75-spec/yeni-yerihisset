"use client";

import Link from "next/link";
import { Footprints, ShoppingBag, ArrowRight, ChevronDown } from "lucide-react";
import { track } from "@/lib/track";

/**
 * Ana sayfa karşılama terminali (popup yerine). "Neden buradasın?" sorusuna iki
 * cevap: Keşif (Barefoot nedir?) ve Mağaza. Mobilde iki blok da ilk ekrana sığar
 * (eşit yükseklik); altta funnel'dan çıkış barı. Görsel-temel: kartların arka
 * planına gerçek fotoğraf koymak için CARD_BG'yi bir görsel URL'iyle değiştir.
 */
const KESIF_BG = ""; // ör: "/hero-barefoot.jpg" (doğal zeminde çıplak ayak)
const MAGAZA_BG = ""; // ör: "/hero-dodura.jpg" (popüler model ürün çekimi)

export default function HomeHero() {
  return (
    <section className="relative flex flex-col min-h-[calc(100svh-6rem)]">
      {/* "Neden buradasın?" — iki bloğun cevap olduğunu netleştirir */}
      <div className="shrink-0 text-center px-4 pt-4 pb-2 md:pt-7 md:pb-4">
        <p className="text-[11px] md:text-xs font-black uppercase tracking-[0.22em] text-olive-600">Neden buradasın?</p>
        <p className="text-[12px] md:text-sm text-slate-400 mt-0.5">Sana uyan yolu seç</p>
      </div>

      {/* İki cevap bloğu — mobilde alt alta (eğitim bloğu daha baskın: bilmeyen
          ziyaretçi zor satın alır); masaüstünde yan yana */}
      <div className="flex-1 grid grid-rows-[1.15fr_0.85fr] md:grid-rows-1 md:grid-cols-2 min-h-0">
        {/* SOL — Merak ediyorum */}
        <Link
          href="/barefoot-nedir"
          onClick={() => track("hero_click", { side: "kesif", to: "/barefoot-nedir" })}
          className="group relative flex flex-col justify-center gap-2.5 md:gap-4 px-6 md:px-14 py-4 overflow-hidden bg-gradient-to-br from-olive-700 to-olive-900 text-white"
          style={KESIF_BG ? { backgroundImage: `url(${KESIF_BG})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        >
          {KESIF_BG && <div className="absolute inset-0 bg-black/45 group-hover:bg-black/35 transition-colors" />}
          <div className="relative z-10 w-full max-w-md mx-auto md:mx-0">
            <div className="w-11 h-11 md:w-14 md:h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center mb-3 md:mb-5">
              <Footprints className="w-6 h-6 md:w-7 md:h-7" />
            </div>
            <p className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] text-white/60 mb-1.5">Merak ediyorum</p>
            <h2 className="text-2xl md:text-4xl font-black tracking-tight italic leading-[1.08] mb-2 md:mb-3">
              Barefoot nedir<br />merak ettim
            </h2>
            <p className="text-[13px] md:text-base text-white/80 leading-snug mb-4 md:mb-6 max-w-sm">
              Çıplak ayak ayakkabı ayağına ne yapar? Kısaca anlatalım, sonra rahatça seçersin.
            </p>
            <span className="inline-flex items-center gap-2 h-11 md:h-12 px-5 md:px-6 rounded-2xl bg-white text-olive-800 font-black text-[13px] md:text-sm uppercase tracking-widest group-hover:gap-3 transition-all">
              Öğrenmeye Başla <ArrowRight className="w-4 h-4 md:w-[18px] md:h-[18px]" />
            </span>
          </div>
        </Link>

        {/* SAĞ — Biliyorum, mağazaya geç */}
        <Link
          href="/products"
          onClick={() => track("hero_click", { side: "magaza", to: "/products" })}
          className="group relative flex flex-col justify-center gap-2.5 md:gap-4 px-6 md:px-14 py-4 overflow-hidden bg-gradient-to-br from-stone-50 to-stone-200 text-slate-900 border-t md:border-t-0 md:border-l border-stone-200"
          style={MAGAZA_BG ? { backgroundImage: `url(${MAGAZA_BG})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        >
          {MAGAZA_BG && <div className="absolute inset-0 bg-white/30 group-hover:bg-white/20 transition-colors" />}
          <div className="relative z-10 w-full max-w-md mx-auto md:mx-0">
            <div className="w-11 h-11 md:w-14 md:h-14 rounded-2xl bg-olive-600 text-white flex items-center justify-center mb-3 md:mb-5">
              <ShoppingBag className="w-[22px] h-[22px] md:w-[26px] md:h-[26px]" />
            </div>
            <p className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] text-olive-600 mb-1.5">Biliyorum</p>
            <h2 className="text-2xl md:text-4xl font-black tracking-tight italic leading-[1.08] mb-2 md:mb-3">
              Biliyorum,<br />mağazaya geç
            </h2>
            <p className="text-[13px] md:text-base text-slate-500 leading-snug mb-4 md:mb-6 max-w-sm">
              Numaranı seç, stoktaki modellere göz at, tek tıkla sipariş ver.
            </p>
            <span className="inline-flex items-center gap-2 h-11 md:h-12 px-5 md:px-6 rounded-2xl bg-olive-600 text-white font-black text-[13px] md:text-sm uppercase tracking-widest group-hover:gap-3 group-hover:bg-olive-700 transition-all">
              Mağazaya Git <ArrowRight className="w-4 h-4 md:w-[18px] md:h-[18px]" />
            </span>
          </div>
        </Link>
      </div>

      {/* Alt bar — funnel'dan çık, klasik ana sayfaya geç */}
      <a
        href="#anasayfa-devam"
        className="shrink-0 flex items-center justify-center gap-2 h-12 md:h-14 bg-white border-t border-slate-100 text-slate-500 hover:text-olive-600 hover:bg-olive-50/50 transition-colors"
      >
        <span className="text-[11px] md:text-xs font-black uppercase tracking-widest">Klasik sayfaya geç</span>
        <ChevronDown className="w-4 h-4 animate-bounce" />
      </a>
    </section>
  );
}
