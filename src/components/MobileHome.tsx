"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { GraduationCap, ShoppingBag, ArrowRight, ChevronRight, ShieldCheck, BadgeCheck, Truck, Footprints } from "lucide-react";
import { formatPriceDisplay, getMinPrice } from "@/lib/product-price";
import { track } from "@/lib/track";

// DESIGN.md ("YeriHisset Grounded Wellness") temelli mobil ana sayfa.
// Yalnız mobilde gösterilir (page.tsx'te md:hidden). Epilogue başlıklar +
// Plus Jakarta Sans gövde; yeşil/krem/terrakota palet.
const C = {
  base: "#FCFAF6",
  card: "#FFFFFF",
  ink: "#1C1C19",
  muted: "#42493A",
  stone: "#76746C",
  green: "#4B7D1E",
  greenDeep: "#3F6D14",
  greenText: "#3F6D14",
  charcoal: "#232320",
  clay: "#D0440B",
  leafTint: "#EBF4E2",
  leafBorder: "#D8EAC7",
  border: "#E8E4DC",
};
const EPI = "var(--font-epilogue), 'Epilogue', system-ui, sans-serif";
const JAK = "var(--font-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif";

const CHIPS = [
  { icon: ShieldCheck, label: "Doğal Ayak Sağlığı", color: "#4B7D1E" },
  { icon: BadgeCheck, label: "%100 Deri & Malzeme", color: "#D0440B" },
  { icon: Truck, label: "Hızlı Kargo", color: "#4B7D1E" },
];

export default function MobileHome({ products }: { products: any[] }) {
  const popular = (products || []).slice(0, 8);

  return (
    <div className="md:hidden" style={{ fontFamily: JAK, background: C.base, color: C.ink }}>
      {/* Soru + alt başlık */}
      <div className="px-5 pt-6 pb-4 text-center">
        <h1 style={{ fontFamily: EPI, fontWeight: 600, fontSize: 27, lineHeight: 1.18, letterSpacing: "-0.015em", color: C.ink, textWrap: "balance" }}>
          Bugün YeriHisset&apos;e hangi adımla geldin?
        </h1>
        <p style={{ color: C.stone, fontSize: 14.5, marginTop: 8 }}>Sana en uygun deneyimi seçerek başlayalım</p>
      </div>

      {/* İki cevap kartı */}
      <div className="px-5 grid grid-cols-2 gap-3">
        <Link
          href="/barefoot-nedir"
          onClick={() => track("hero_click", { side: "kesif", to: "/barefoot-nedir" })}
          className="flex flex-col rounded-2xl p-4 active:scale-[0.98] transition-transform"
          style={{ background: C.green, color: "#fff", minHeight: 168 }}
        >
          <GraduationCap size={30} strokeWidth={1.9} />
          <div className="mt-auto pt-6">
            <p style={{ fontFamily: EPI, fontWeight: 600, fontSize: 17, lineHeight: 1.2 }}>Barefoot Rehberini Keşfet</p>
            <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.82)", marginTop: 5 }}>İlk kez başlayanlar</p>
          </div>
        </Link>

        <Link
          href="/products"
          onClick={() => track("hero_click", { side: "magaza", to: "/products" })}
          className="flex flex-col rounded-2xl p-4 active:scale-[0.98] transition-transform"
          style={{ background: C.charcoal, color: "#fff", minHeight: 168 }}
        >
          <ShoppingBag size={28} strokeWidth={1.9} />
          <div className="mt-auto pt-6">
            <p style={{ fontFamily: EPI, fontWeight: 600, fontSize: 17, lineHeight: 1.2 }}>Doğrudan Mağazaya Geç</p>
            <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.7)", marginTop: 5 }}>Koleksiyonları incele</p>
          </div>
        </Link>
      </div>

      {/* Devam et */}
      <div className="px-5 pt-4 pb-5 text-center">
        <a href="#populer" className="inline-flex items-center gap-2" style={{ color: C.muted, fontSize: 14, fontWeight: 600 }}>
          Veya doğrudan ana sayfaya devam et <ArrowRight size={17} />
        </a>
      </div>

      {/* Güven çipleri (yatay kaydırma) */}
      <div className="flex gap-2.5 overflow-x-auto px-5 pb-6" style={{ scrollbarWidth: "none" }}>
        {CHIPS.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="flex items-center gap-2 shrink-0 rounded-full px-4 h-11"
              style={{ background: C.card, border: `1px solid ${C.border}` }}>
              <Icon size={17} style={{ color: c.color }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, whiteSpace: "nowrap" }}>{c.label}</span>
            </div>
          );
        })}
      </div>

      {/* Popüler Modeller */}
      <section id="populer" className="pb-6">
        <div className="px-5 flex items-end justify-between mb-4">
          <div>
            <p style={{ color: C.greenText, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>HIZLI BAKIŞ</p>
            <h2 style={{ fontFamily: EPI, fontWeight: 600, fontSize: 23, letterSpacing: "-0.01em", color: C.ink, marginTop: 2 }}>Popüler Modeller</h2>
          </div>
          <Link href="/products" className="inline-flex items-center gap-1 shrink-0" style={{ color: C.greenText, fontSize: 14, fontWeight: 700 }}>
            Tümü <ChevronRight size={16} />
          </Link>
        </div>

        <div className="flex gap-4 overflow-x-auto px-5 pb-1" style={{ scrollbarWidth: "none" }}>
          {popular.map((p) => {
            const img = (p.images && p.images.length > 0) ? p.images[0] : (p.image_url || "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?q=80&w=400");
            const badge = p.categories?.name || p.brands?.name;
            const installment = getMinPrice(p) > 1000;
            return (
              <Link key={p.id} href={`/products/${p.slug}`} className="shrink-0" style={{ width: 232 }}>
                <div className="rounded-2xl overflow-hidden" style={{ background: C.card, border: `1px solid ${C.border}` }}>
                  <div className="relative" style={{ aspectRatio: "4 / 3", background: "#F3EFEA" }}>
                    <img src={img} alt={p.title} className="w-full h-full object-cover" />
                    {badge && (
                      <span className="absolute top-3 left-3 rounded-full px-3 py-1"
                        style={{ background: "rgba(255,255,255,0.92)", color: C.ink, fontSize: 11, fontWeight: 700 }}>
                        {badge}
                      </span>
                    )}
                  </div>
                  <div className="p-3.5">
                    {p.brands?.name && <p style={{ color: C.stone, fontSize: 12.5, fontWeight: 600 }}>{p.brands.name}</p>}
                    <h3 style={{ fontFamily: EPI, fontWeight: 600, fontSize: 15.5, color: C.ink, lineHeight: 1.25, marginTop: 1 }}>{p.title}</h3>
                    <div className="flex items-center justify-between mt-2">
                      <span style={{ color: C.greenText, fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em" }}>{formatPriceDisplay(p)}</span>
                      {installment && <span style={{ color: C.clay, fontSize: 12.5, fontWeight: 700 }}>3 Taksit</span>}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
          {popular.length === 0 && (
            <div className="shrink-0 text-sm py-8" style={{ color: C.stone }}>Ürünler yükleniyor…</div>
          )}
        </div>
      </section>

      {/* Doğru Numarayı Bul */}
      <div className="px-5 pb-8">
        <Link href="/products" className="flex items-center gap-4 rounded-2xl p-4"
          style={{ background: C.leafTint, border: `1px solid ${C.leafBorder}` }}>
          <div className="w-14 h-14 rounded-full shrink-0 flex items-center justify-center" style={{ background: "#fff", border: `1px solid ${C.leafBorder}` }}>
            <Footprints size={26} style={{ color: C.green }} />
          </div>
          <div className="flex-1">
            <p style={{ fontFamily: EPI, fontWeight: 600, fontSize: 17, color: C.ink }}>Doğru Numarayı Bul</p>
            <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.45, marginTop: 3 }}>
              Ayak tabanı ölçünü gir, sıfır yanılma payıyla barefoot bedenini belirleyelim.
            </p>
          </div>
          <ChevronRight size={20} style={{ color: C.stone }} />
        </Link>
      </div>
    </div>
  );
}
