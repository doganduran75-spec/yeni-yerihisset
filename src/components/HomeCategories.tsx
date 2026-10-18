"use client";

// KATEGORİ KUTULARI — ana sayfa (kullanıcı kararları 2026-10-18): her kategoriden stoktaki bir ürün görseli;
// tıklayınca segment mağazasında o kategori açılır (page.tsx › getCategoryTiles).
import Image from "next/image";
import Link from "next/link";
import { SEGMENTS, LAST_SEGMENT_KEY, type Segment } from "@/config/segments";
import { useHomeContent } from "@/lib/home-content-context";
import { track } from "@/lib/track";

export type CategoryTile = { id: string; name: string; href: string; image: string | null; segment: string; min?: number | null; max?: number | null };

// "₺2.999 – ₺3.350" (kuruş varsa ",50" gösterilir); tek fiyatsa tek tutar
const tl = (n: number) => `₺${n.toLocaleString("tr-TR", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
const range = (t: CategoryTile) => (t.min ? (t.max && t.max !== t.min ? `${tl(t.min)} – ${tl(t.max)}` : tl(t.min)) : null);

const EPI = "var(--font-epilogue), 'Epilogue', system-ui, sans-serif";

export default function HomeCategories({ tiles, variant }: { tiles: CategoryTile[]; variant: "mobile" | "desktop" }) {
  const HC = useHomeContent();
  if (!HC.categories.enabled || tiles.length === 0) return null;
  const desk = variant === "desktop";
  return (
    <section className={desk ? "container mx-auto px-8 pt-12 max-w-6xl" : "px-5 pt-5 pb-2"}>
      <h2 className="mb-3" style={{ fontFamily: EPI, fontWeight: 600, fontSize: desk ? 28 : 21, color: "#1C1C19", letterSpacing: "-0.01em" }}>{HC.categories.title}</h2>
      <div className={desk ? "grid grid-cols-4 gap-5" : "grid grid-cols-2 gap-3"}>
        {tiles.map((t) => (
          <Link key={t.id} href={t.href}
            onClick={() => { try { localStorage.setItem(LAST_SEGMENT_KEY, t.segment); } catch { /* yok */ } track("home_category_click", { category: t.name, segment: t.segment }); }}
            className="group rounded-2xl overflow-hidden bg-white active:scale-[0.98] transition-transform" style={{ border: "1px solid #E8E4DC" }}>
            <div className="relative bg-[#F3EFEA]" style={{ aspectRatio: "1 / 1" }}>
              {t.image && <Image src={t.image} alt={t.name} fill sizes={desk ? "280px" : "50vw"} className="object-cover group-hover:scale-105 transition-transform duration-700" />}
            </div>
            <div className="px-3 py-2.5">
              <p style={{ fontFamily: EPI, fontWeight: 700, fontSize: desk ? 16 : 15, color: "#1C1C19", lineHeight: 1.2 }}>{t.name}</p>
              <p style={{ color: "#76746C", fontSize: 12, fontWeight: 600, marginTop: 1 }}>{SEGMENTS[t.segment as Segment]?.label}</p>
              {range(t) && <p data-tile-price style={{ color: "#3F6D14", fontSize: desk ? 15 : 13.5, fontWeight: 700, marginTop: 3, whiteSpace: "nowrap" }}>{range(t)}</p>}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
