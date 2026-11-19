"use client";

// "DEVAMINI OKU" (kullanıcı 2026-11-19): uzun yorum / açıklama kısa görünür, dokununca açılır. Metnin tamamı sayfada
// (HTML'de) durur — arama motorları ve yapay zekâ hepsini okur; yalnız görünüm kısalır. Kısa metinde düğme çıkmaz.
//  * lines: düz metin için satır sınırı (yorumlar, line-clamp)
//  * maxHeight: biçimli içerik (başlık, liste) için yükseklik sınırı + alttan solma
import { useEffect, useRef, useState } from "react";

export default function ReadMore({ children, lines, maxHeight, moreLabel = "Devamını oku", lessLabel = "Daha az göster", className = "" }: {
  children: React.ReactNode;
  lines?: number;
  maxHeight?: number;
  moreLabel?: string;
  lessLabel?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => { if (!open) setOverflows(el.scrollHeight > el.clientHeight + 4); };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  const clampStyle: React.CSSProperties = open ? {} : lines
    ? { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" }
    : { maxHeight, overflow: "hidden" };

  return (
    <div className={className}>
      <div className="relative">
        <div ref={ref} style={clampStyle}>{children}</div>
        {!open && overflows && !lines && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />}
      </div>
      {(overflows || open) && (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="mt-2 text-sm font-bold text-olive-700 hover:text-olive-900 underline underline-offset-4">
          {open ? lessLabel : moreLabel}
        </button>
      )}
    </div>
  );
}
