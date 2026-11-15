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
  // TAM EKRAN (kullanıcı 2026-11-15, Ayarlar › Ana Sayfa › "Hikâye tam ekran"): görsel bütün ekranı kaplar (dik görsel
  // imageTall, yoksa yatay görsel kırpılır), yazı görselin üstünde; çubuklar / başlık / düğme görselin üstünde.
  const full = !!P.storyFullscreen;
  const tap = {
    onPointerDown: () => { downAt.current = Date.now(); setPaused(true); },
    onPointerUp: (e: React.PointerEvent) => {
      const held = Date.now() - downAt.current;
      setPaused(false);
      if (held >= HOLD_MS) return;
      if (e.clientX / window.innerWidth < 0.3) prev(); else next();
    },
    onPointerCancel: () => setPaused(false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
  const fullImg = it.imageTall || it.image;
  // Panelden görseli yukarı / aşağı kaydırma (kullanıcı 2026-11-15: ürün her görselde aynı göz hizasında olsun; yeniden üretmeden ayar)
  const shift = Math.max(-25, Math.min(25, Number((it as { shiftUp?: number }).shiftUp) || 0));

  return (
    <div className={`md:hidden fixed inset-0 z-[70] flex flex-col bg-[#F4EFE6]`} role="dialog" aria-modal="true" aria-label="Barefoot nedir?"
      style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>
      {/* Tam ekran: görsel arkada, alt yarıda okunurluk için koyu geçiş */}
      {full && phase === "story" && (
        <div className="absolute inset-0 select-none touch-manipulation" {...tap}>
          {fullImg && <img key={fullImg} src={fullImg} alt={it.title} draggable={false} className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={shift ? { transform: `translateY(${-shift}%)` } : undefined} />}
          {/* sonraki görseller önceden yüklensin (kısa sürelerde boş ekran olmasın) */}
          {items.map((x) => { const u = x.imageTall || x.image; return u && u !== fullImg ? <img key={`pre-${u}`} src={u} alt="" aria-hidden className="hidden" /> : null; })}
          {/* Açık krem geçiş: koyu yazı her görselde okunur (kullanıcı 2026-11-15: beyaz yazı yerine) */}
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#F4EFE6]/95 via-[#F4EFE6]/60 to-transparent pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-t from-[#F4EFE6] via-[#F4EFE6]/85 to-transparent pointer-events-none" />
        </div>
      )}
      {/* İlerleme çubukları */}
      <div className="relative flex gap-1.5 px-3 pointer-events-none" style={{ paddingTop: "calc(env(safe-area-inset-top) + 10px)" }}>
        {items.map((x, i) => (
          <div key={x.title} className={`h-[3px] flex-1 rounded-full overflow-hidden bg-black/10`}>
            <div className="h-full rounded-full" style={{ background: ORANGE, width: `${(phase === "choose" || i < idx ? 1 : i === idx ? progress : 0) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="relative flex items-center justify-between px-4 pt-3">
        {full && phase === "story" ? (
          // Kaçıncı görsel olduğu yalnız üstteki çubuklarda (yazıda "2 / 5" yok — kullanıcı 2026-11-15)
          // Tam ekran: üstte büyük "BAREFOOT NEDİR?" (panelde "Üst yazı"); marka satırı yok (kullanıcı 2026-11-15)
          <span className="text-[26px] leading-none font-black tracking-tight text-[#3F6D14]" style={{ fontFamily: "var(--font-epilogue), system-ui, sans-serif" }}>{P.eyebrow}</span>
        ) : phase === "story" ? (
          <span className="text-[13px] font-bold text-[#3F6D14]">YeriHisset · Barefoot nedir?</span>
        ) : <span />}
        <button type="button" aria-label="Kapat" onClick={() => close("x")} className="p-1 text-slate-600"><X size={24} /></button>
      </div>

      {full && phase === "story" ? (
        <div className="relative flex-1 min-h-0 flex flex-col justify-end px-6 pb-5 pointer-events-none">
          <h2 className="text-[32px] leading-tight font-black text-[#1C1C19]" style={{ fontFamily: "var(--font-epilogue), system-ui, sans-serif" }}>{it.title}</h2>
          <p className="mt-2 text-[17px] leading-snug text-[#42493A]">{it.text}</p>
        </div>
      ) : phase === "story" ? (
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
            <h2 className="text-[30px] leading-tight font-black text-[#1C1C19]" style={{ fontFamily: "var(--font-epilogue), system-ui, sans-serif" }}>{it.title}</h2>
            <p className="mt-2 text-[16px] leading-snug text-[#42493A]">{it.text}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-6">
          {/* Son ekran (kullanıcı 2026-11-15): başlık "Mağazanı seç", alt yazı ve üstteki marka satırı yok */}
          <h2 className="text-2xl font-black text-[#1C1C19] mb-5">Mağazanı seç</h2>
          <SegmentChooser compact source="hikaye" onPick={() => close("segment")} />
          <button type="button" onClick={() => close("ana_sayfa")} className="mt-5 w-full text-center text-sm font-semibold text-slate-500 py-3">Ana sayfaya dön</button>
        </div>
      )}

      {/* Alt menü yüksekliğinde "Alışverişe geç" */}
      {phase === "story" && (
        <div className={`relative px-4 pt-2 ${full ? "" : "bg-[#F4EFE6]"}`} style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <button type="button" onClick={shop}
            className="w-full h-16 rounded-2xl text-white text-[17px] font-bold active:scale-[0.99] transition-transform" style={{ background: "#3F6D14" }}>
            {P.shopButton}
          </button>
        </div>
      )}
    </div>
  );
}
