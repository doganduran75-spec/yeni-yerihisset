"use client";

/* eslint-disable @next/next/no-img-element */
// PRENSİP HİKÂYESİ — telefonda ilk ziyarette tam ekran (kullanıcı kararları 2026-10-18; eski karşılama videosunun yerine).
//  * Instagram story gibi: üstte TURUNCU ilerleme çubukları; dokun → sonraki (sol kenar → önceki), basılı tut → durur.
//  * Süreler panelden (Ayarlar › Ana Sayfa › Barefoot prensipleri › Hikâyede kaç saniye).
//  * En altta alt menü yüksekliğinde "Alışverişe geç"; hikâye bitince (ya da düğmeyle) mağaza seçimi açılır.
//  * Gösterilmez: bilgisayarda, daha önce görene, reklamdan / kampanyadan gelene (gclid, fbclid, utm_…), "hareketi azalt"
//    tercihinde. Ana sayfadaki "Barefoot nedir? İzle" yeniden açar; ?hikaye=1 deneme için zorlar.
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useHomeContent } from "@/lib/home-content-context";
import SegmentChooser from "@/components/SegmentChooser";
import { track } from "@/lib/track";

export const STORIES_OPEN_EVENT = "yh:stories-open";
const SEEN_KEY = "yh:stories-seen";
const AD_PARAMS = ["gclid", "gbraid", "wbraid", "fbclid", "ttclid", "msclkid"];
const HOLD_MS = 220;   // bundan uzun basış = duraklat (dokunma sayılmaz)
const ORANGE = "#F97316";

export default function PrincipleStories() {
  const HC = useHomeContent();
  const P = HC.principles;
  const items = P.items.filter((x) => x.show && x.title);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"story" | "choose">("story");
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 (aktif hikâye)
  const elapsed = useRef(0);
  const downAt = useRef(0);
  const source = useRef<"ilk" | "tekrar">("ilk");

  const start = useCallback((src: "ilk" | "tekrar") => {
    source.current = src;
    elapsed.current = 0;
    setIdx(0); setProgress(0); setPhase("story"); setPaused(false); setOpen(true);
    try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* yok */ }
    track("story_shown", { source: src });
  }, []);

  // İlk ziyaret: uygun mu?
  useEffect(() => {
    if (!P.storiesEnabled || items.length === 0) return;
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get("hikaye") === "1") { start("tekrar"); return; } // eslint-disable-line react-hooks/set-state-in-effect
      if (window.innerWidth >= 768 || localStorage.getItem(SEEN_KEY)) return;
      if (AD_PARAMS.some((k) => q.has(k)) || [...q.keys()].some((k) => k.startsWith("utm_"))) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    } catch { return; }
    start("ilk"); // eslint-disable-line react-hooks/set-state-in-effect
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // "Barefoot nedir? İzle" bağlantısı
  useEffect(() => {
    const h = () => start("tekrar");
    window.addEventListener(STORIES_OPEN_EVENT, h);
    return () => window.removeEventListener(STORIES_OPEN_EVENT, h);
  }, [start]);

  // Açıkken sayfa kaymasın
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const idxRef = useRef(0);
  useEffect(() => { idxRef.current = idx; }, [idx]);
  const next = useCallback(() => {
    elapsed.current = 0; setProgress(0);
    const i = idxRef.current;
    if (i + 1 >= items.length) { setPhase("choose"); track("story_complete", { source: source.current }); return; }
    track("story_progress", { i: i + 2 });
    setIdx(i + 1);
  }, [items.length]);
  const prev = () => { elapsed.current = 0; setProgress(0); setIdx((i) => Math.max(0, i - 1)); };

  // Zamanlayıcı (duraklatılabilir)
  useEffect(() => {
    if (!open || phase !== "story" || paused) return;
    const dur = Math.max(1, Number(items[idx]?.seconds) || 4) * 1000;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      elapsed.current += now - last; last = now;
      const p = Math.min(1, elapsed.current / dur);
      setProgress(p);
      if (p >= 1) { next(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, phase, paused, idx, items, next]);

  const close = (why: string) => {
    setOpen(false);
    track("story_close", { why, at: idx + 1, phase });
  };
  const shop = () => { track("story_shop_click", { at: idx + 1 }); setPhase("choose"); };

  if (!open || items.length === 0) return null;
  const it = items[idx];

  return (
    <div className="md:hidden fixed inset-0 z-[70] flex flex-col bg-[#F4EFE6]" role="dialog" aria-modal="true" aria-label="Barefoot nedir?"
      style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>
      {/* İlerleme çubukları */}
      <div className="flex gap-1.5 px-3" style={{ paddingTop: "calc(env(safe-area-inset-top) + 10px)" }}>
        {items.map((x, i) => (
          <div key={x.title} className="h-[3px] flex-1 rounded-full overflow-hidden bg-black/10">
            <div className="h-full rounded-full" style={{ background: ORANGE, width: `${(phase === "choose" || i < idx ? 1 : i === idx ? progress : 0) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="text-[13px] font-bold text-[#3F6D14]">YeriHisset · Barefoot nedir?</span>
        <button type="button" aria-label="Kapat" onClick={() => close("x")} className="p-1 text-slate-600"><X size={24} /></button>
      </div>

      {phase === "story" ? (
        <div className="flex-1 min-h-0 flex flex-col select-none touch-manipulation"
          onPointerDown={() => { downAt.current = Date.now(); setPaused(true); }}
          onPointerUp={(e) => {
            const held = Date.now() - downAt.current;
            setPaused(false);
            if (held >= HOLD_MS) return;
            const x = e.clientX / window.innerWidth;
            if (x < 0.3) prev(); else next();
          }}
          onPointerCancel={() => setPaused(false)}
          onContextMenu={(e) => e.preventDefault()}>
          <div className="flex-1 min-h-0 flex items-center justify-center px-6">
            {it.image && <img src={it.image} alt={it.title} draggable={false} className="max-h-full w-full object-contain pointer-events-none" />}
          </div>
          <div className="px-6 pb-6">
            <p className="text-[13px] font-bold tracking-wide" style={{ color: ORANGE }}>{idx + 1} / {items.length}</p>
            <h2 className="mt-1 text-[30px] leading-tight font-black text-[#1C1C19]" style={{ fontFamily: "var(--font-epilogue), system-ui, sans-serif" }}>{it.title}</h2>
            <p className="mt-2 text-[16px] leading-snug text-[#42493A]">{it.text}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-6">
          <h2 className="text-2xl font-black text-[#1C1C19]">Kimin için bakıyorsun?</h2>
          <p className="text-sm text-slate-500 mt-1 mb-5">Mağazanı seç; numaranı seçip stoktakileri gör.</p>
          <SegmentChooser compact source="hikaye" onPick={() => close("segment")} />
          <button type="button" onClick={() => close("ana_sayfa")} className="mt-5 w-full text-center text-sm font-semibold text-slate-500 py-3">Ana sayfaya dön</button>
        </div>
      )}

      {/* Alt menü yüksekliğinde "Alışverişe geç" */}
      {phase === "story" && (
        <div className="px-4 pt-2 bg-[#F4EFE6]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <button type="button" onClick={shop}
            className="w-full h-16 rounded-2xl text-white text-[17px] font-bold active:scale-[0.99] transition-transform" style={{ background: "#3F6D14" }}>
            {P.shopButton}
          </button>
        </div>
      )}
    </div>
  );
}
