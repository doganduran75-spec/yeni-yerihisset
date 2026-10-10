"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { track } from "@/lib/track";

// MOBİL KARŞILAMA VİDEOSU (kullanıcı notu 10). Kurallar:
//  * Yalnız telefonda, ana sayfada, bir kez (sonra yh:intro-seen). Ayarlar › Genel'den kapatılabilir.
//  * SAYFA ÖNCE GELİR (boş ekran yok): video arka planda yüklenir; birkaç saniyede hazır olursa tam ekran
//    açılıp oynar, bitince (ya da dokununca / "Geç") kaybolur ve ziyaretçi ana sayfanın başına —
//    "barefoot nedir / mağaza" kartlarına — döner. Hazır olmazsa hiç gösterilmez (sonraki ziyarette dener).
//  * Veri tasarrufu / yavaş bağlantı / "hareketi azalt" tercihinde gösterilmez.
const SEEN_KEY = "yh:intro-seen";
const READY_TIMEOUT = 3500; // ms — video bu sürede oynamaya hazır olmazsa vazgeç
const MAX_SHOW = 9000;      // güvenlik: en uzun bu kadar kalır

export default function MobileIntro() {
  const [src, setSrc] = useState<string | null>(null);
  const [phase, setPhase] = useState<"off" | "in" | "out">("off");
  const vid = useRef<HTMLVideoElement>(null);
  const closed = useRef(false);

  // Uygun mu? → video adresini ayarlardan al
  useEffect(() => {
    try {
      // ?intro=1 → yeniden göster (deneme için)
      if (new URLSearchParams(window.location.search).get("intro") === "1") localStorage.removeItem(SEEN_KEY);
      if (window.innerWidth >= 768 || localStorage.getItem(SEEN_KEY)) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const conn = (navigator as any).connection;
      if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType || "")) return;
    } catch { return; }
    (supabase as any).from("settings").select("intro_video_enabled, intro_video_url").limit(1).maybeSingle()
      .then(({ data }: any) => { if (data?.intro_video_enabled && data?.intro_video_url) setSrc(data.intro_video_url); })
      .catch(() => {});
  }, []);

  // Arka planda yükle; hazır olunca tam ekran oynat
  useEffect(() => {
    const v = vid.current;
    if (!src || !v) return;
    let shown = false;
    const giveUp = setTimeout(() => { if (!shown) { v.pause(); setSrc(null); } }, READY_TIMEOUT);
    // Görünmezken sessiz oynatmayı başlat (iPhone Safari önceden yüklemeyebilir); ilk kare gelince
    // başa sarıp tam ekran göster.
    const onPlaying = () => {
      if (shown || closed.current) return;
      shown = true;
      clearTimeout(giveUp);
      try { v.currentTime = 0; } catch { /* yut */ }
      setPhase("in");
      try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* yut */ }
      track("intro_shown", { src });
    };
    const retry = () => { v.play().catch(() => setSrc(null)); };
    v.addEventListener("playing", onPlaying);
    v.load();
    v.play().catch(() => v.addEventListener("canplaythrough", retry, { once: true })); // otomatik oynatma engellenirse gösterme
    return () => { clearTimeout(giveUp); v.removeEventListener("playing", onPlaying); v.removeEventListener("canplaythrough", retry); };
  }, [src]);

  // Açıkken sayfa kaymasın; en uzun süre güvenliği
  useEffect(() => {
    if (phase !== "in") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => close("timeout"), MAX_SHOW);
    return () => { document.body.style.overflow = prev; clearTimeout(t); };
  }, [phase]);

  function close(how: string) {
    if (closed.current) return;
    closed.current = true;
    track("intro_closed", { how });
    setPhase("out");
    window.scrollTo({ top: 0 });
    setTimeout(() => { setPhase("off"); setSrc(null); }, 450);
  }

  if (!src) return null;
  return (
    <div
      aria-hidden={phase !== "in"}
      onClick={() => close("tap")}
      className="md:hidden fixed inset-0 z-[95] bg-black transition-opacity duration-500"
      style={{ opacity: phase === "in" ? 1 : 0, pointerEvents: phase === "in" ? "auto" : "none" }}
    >
      <video
        ref={vid}
        src={src}
        muted
        playsInline
        preload="auto"
        onEnded={() => close("ended")}
        className="w-full h-full object-cover"
      />
      <button
        onClick={(e) => { e.stopPropagation(); close("skip"); }}
        className="absolute top-[max(16px,env(safe-area-inset-top))] right-4 h-9 px-3 rounded-full bg-black/35 text-white text-xs font-bold flex items-center gap-1 backdrop-blur"
      >
        Geç <X size={14} />
      </button>
    </div>
  );
}
