"use client";

/* eslint-disable @next/next/no-img-element */
// BAREFOOT PRENSİPLERİ — ana sayfanın üstü (kullanıcı kararları 2026-10-18): açılış hikâyesinin küçüğü.
// Mobilde ekranın ~1/3'ü, parmakla sağa sola kaydırılır; masaüstünde beş kart yan yana.
// İçerik: Ayarlar › Ana Sayfa › Barefoot prensipleri (varsayılan src/config/homeContent.ts).
import { useRef, useState } from "react";
import Link from "next/link";
import { PlayCircle } from "lucide-react";
import { useHomeContent } from "@/lib/home-content-context";
import { track } from "@/lib/track";
import { STORIES_OPEN_EVENT } from "@/components/PrincipleStories";

const EPI = "var(--font-epilogue), 'Epilogue', system-ui, sans-serif";

export default function PrincipleCarousel({ variant }: { variant: "mobile" | "desktop" }) {
  const HC = useHomeContent();
  const P = HC.principles;
  const items = P.items.filter((x) => x.show && x.title);
  const [active, setActive] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  if (!P.enabled || items.length === 0) return null;

  if (variant === "desktop") {
    return (
      <section className="container mx-auto px-8 pt-10 max-w-6xl">
        <div className="flex items-end justify-between mb-5">
          <p style={{ color: "#3F6D14", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em" }}>{P.eyebrow}</p>
          <Link href="/barefoot-nedir" className="text-sm font-bold" style={{ color: "#3F6D14" }}>Barefoot nedir? →</Link>
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map((it) => (
            <div key={it.title} className="rounded-2xl overflow-hidden bg-white" style={{ border: "1px solid #E8E4DC" }}>
              <div className="bg-[#F4EFE6]" style={{ aspectRatio: "4 / 3" }}>
                {it.image && <img src={it.image} alt={it.title} className="w-full h-full object-contain" loading="lazy" />}
              </div>
              <div className="p-4">
                <p style={{ fontFamily: EPI, fontWeight: 700, fontSize: 16, color: "#1C1C19" }}>{it.title}</p>
                <p style={{ color: "#42493A", fontSize: 13.5, lineHeight: 1.5, marginTop: 4 }}>{it.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const onScroll = () => {
    const el = strip.current;
    if (!el) return;
    const w = el.firstElementChild ? (el.firstElementChild as HTMLElement).offsetWidth + 12 : el.clientWidth;
    const i = Math.round(el.scrollLeft / w);
    if (i !== active) { setActive(i); track("principle_swipe", { i }); }
  };

  return (
    <section className="pt-4 pb-2">
      <div className="px-5 flex items-center justify-between mb-2.5">
        <p style={{ color: "#3F6D14", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>{P.eyebrow}</p>
        {P.storiesEnabled && (
          <button type="button" onClick={() => { track("story_replay", {}); window.dispatchEvent(new Event(STORIES_OPEN_EVENT)); }}
            className="inline-flex items-center gap-1 text-[13px] font-bold" style={{ color: "#3F6D14" }}>
            <PlayCircle size={16} /> {P.replayLink}
          </button>
        )}
      </div>
      <div ref={strip} onScroll={onScroll} className="flex gap-3 overflow-x-auto snap-x snap-mandatory px-5" style={{ scrollbarWidth: "none", scrollPaddingInline: 20 }}>
        {items.map((it) => (
          <div key={it.title} className="snap-start shrink-0 w-[82%] rounded-2xl overflow-hidden bg-white flex flex-col"
            style={{ border: "1px solid #E8E4DC", height: "max(220px, 33svh)" }}>
            <div className="flex-1 min-h-0 bg-[#F4EFE6]">
              {it.image && <img src={it.image} alt={it.title} className="w-full h-full object-contain" loading="lazy" />}
            </div>
            <div className="px-4 py-3">
              <p style={{ fontFamily: EPI, fontWeight: 700, fontSize: 17, color: "#1C1C19", lineHeight: 1.2 }}>{it.title}</p>
              <p style={{ color: "#42493A", fontSize: 13, lineHeight: 1.45, marginTop: 3 }}>{it.text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-1.5 mt-2.5" aria-hidden>
        {items.map((it, i) => (
          <span key={it.title} className="h-1.5 rounded-full transition-all" style={{ width: i === active ? 18 : 6, background: i === active ? "#F97316" : "#D9D4CA" }} />
        ))}
      </div>
    </section>
  );
}
