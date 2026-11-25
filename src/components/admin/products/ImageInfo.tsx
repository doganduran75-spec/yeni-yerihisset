"use client";

// Ürün formunda yüklenmiş görselin ölçüsü + dosya boyutu ve indirme düğmesi (kullanıcı 2026-11-25:
// "yüklediğim fotoların boyutlarını göremiyorum ya da geri indiremiyorum"). Ağır görsel kırmızı görünür.
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

export const HEAVY_KB = 500;
export const HEAVY_PX = 2000;

// Supabase Storage: ?download=<ad> dosyayı "indir" olarak verir (başka alan adında <a download> çalışmaz)
export function imageDownloadUrl(url: string) {
  try {
    const u = new URL(url);
    u.searchParams.set("download", decodeURIComponent(u.pathname.split("/").pop() || "gorsel"));
    return u.toString();
  } catch {
    return url;
  }
}

export default function ImageInfo({ url, className }: { url: string; className?: string }) {
  const [px, setPx] = useState<{ w: number; h: number } | null>(null);
  const [kb, setKb] = useState<number | null>(null);

  useEffect(() => {
    let off = false;
    const img = new Image();
    img.onload = () => { if (!off) setPx({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.src = url;
    fetch(url, { method: "HEAD", cache: "no-store" })
      .then((r) => { const n = Number(r.headers.get("content-length")); if (!off && n > 0) setKb(Math.round(n / 1024)); })
      .catch(() => {});
    return () => { off = true; };
  }, [url]);

  const heavy = (kb !== null && kb > HEAVY_KB) || (px !== null && Math.max(px.w, px.h) > HEAVY_PX);
  const size = kb === null ? "" : kb >= 1024 ? `${(kb / 1024).toFixed(1).replace(".", ",")} MB` : `${kb} KB`;

  return (
    <div
      className={cn(
        "absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white shadow",
        heavy ? "bg-red-600" : "bg-black/55",
        className,
      )}
      title={heavy ? `Görsel ağır: ${HEAVY_KB} KB / ${HEAVY_PX} px altına küçültün` : "Görsel ölçüsü ve dosya boyutu"}
    >
      <span data-image-info>{px ? `${px.w}×${px.h}` : "…"}{size ? ` · ${size}` : ""}</span>
      <a
        href={imageDownloadUrl(url)}
        onClick={(e) => e.stopPropagation()}
        draggable={false}
        className="pointer-events-auto rounded-full p-0.5 hover:bg-white/25"
        title="Görseli indir"
        aria-label="Görseli indir"
      >
        <Download size={10} />
      </a>
    </div>
  );
}
