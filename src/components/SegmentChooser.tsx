"use client";

// Mağaza seçimi: Yetişkin / 0–4 Yaş İlkadım (kullanıcı kararları 2026-10-18). /magaza sayfasında ve alt menüdeki
// Mağaza panelinde aynı kartlar. Son seçilen segment vurgulanır ("Devam et").
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { SEGMENTS, LAST_SEGMENT_KEY, type Segment } from "@/config/segments";
import { track } from "@/lib/track";

export default function SegmentChooser({ images = {}, source, onPick, compact = false }: {
  images?: Partial<Record<Segment, string | null>>;
  source: string;            // ölçüm: magaza_sayfasi | alt_menu | ana_sayfa | hikaye
  onPick?: () => void;
  compact?: boolean;         // alt menü paneli: görselsiz, kısa
}) {
  const [last, setLast] = useState<Segment | null>(null);
  useEffect(() => {
    try { const v = localStorage.getItem(LAST_SEGMENT_KEY); if (v === "yetiskin" || v === "ilkadim") setLast(v); } catch { /* yok */ } // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  return (
    <div className={compact ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 sm:grid-cols-2 gap-4"}>
      {(Object.keys(SEGMENTS) as Segment[]).map((seg) => {
        const S = SEGMENTS[seg];
        const img = images[seg];
        const isLast = last === seg;
        return (
          <Link key={seg} href={S.path}
            onClick={() => { try { localStorage.setItem(LAST_SEGMENT_KEY, seg); } catch { /* yok */ } track("segment_select", { segment: seg, source }); onPick?.(); }}
            className={`group relative flex overflow-hidden rounded-3xl border-2 transition-all active:scale-[0.99] ${isLast ? "border-olive-600" : "border-slate-200 hover:border-olive-300"} ${compact ? "items-center gap-4 p-4 bg-white" : "flex-col bg-white"}`}>
            {!compact && (
              <div className="relative w-full bg-[#F3EFEA]" style={{ aspectRatio: "16 / 10" }}>
                {img && <Image src={img} alt={S.h1} fill sizes="(max-width: 640px) 100vw, 50vw" className="object-cover group-hover:scale-105 transition-transform duration-700" />}
              </div>
            )}
            <div className={compact ? "flex-1 min-w-0" : "p-5"}>
              {isLast && <span className="inline-block mb-1 rounded-full bg-olive-600 text-white text-[11px] font-bold px-2.5 py-0.5">Devam et</span>}
              <p className="text-xl font-black text-slate-900 tracking-tight">{S.label}</p>
              <p className="text-sm text-slate-500 mt-0.5">{S.card}</p>
            </div>
            <ArrowRight size={22} className={`shrink-0 text-olive-700 ${compact ? "" : "absolute right-5 bottom-5"}`} />
          </Link>
        );
      })}
    </div>
  );
}
