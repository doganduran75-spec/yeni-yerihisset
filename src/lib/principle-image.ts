import type { CSSProperties } from "react";

// PRENSİP KARTI GÖRSELİ (kullanıcı 2026-11-18, ortak dosya 2026-11-19): dik görsel (imageTall, telefonda tam ekran hikâye)
// yüklüyse kartlarda da o kullanılır — kartı doldurur (object-cover), görünen kısım panelde "Kartlarda görünen kısım"
// (focusY: 0 üst, 100 alt). Dik görsel yoksa eski davranış: yatay görsel (image) kırpılmadan sığdırılır.
// Kullananlar: ana sayfa prensip kartları (PrincipleCarousel, masaüstü + telefon) ve Hakkımızda › "Her ayakkabıda aradığımız".
// Sunucu bileşeni de çağırabilsin diye "use client" dosyasında değil.
export type PItem = { image?: string; imageTall?: string; focusY?: number; title: string };

/** Kartlarda kutu oranları — panel önizlemesi (HomeContentTab › PrincipleCrop) aynı oranları gösterir */
export const PRINCIPLE_CARD_RATIO = { desktop: "4 / 3", mobile: "10 / 7" } as const;

export function principleCardImage(it: PItem): { src: string; className: string; style?: CSSProperties } | null {
  if (it.imageTall) {
    const y = Math.max(0, Math.min(100, Number(it.focusY ?? 50)));
    return { src: it.imageTall, className: "w-full h-full object-cover", style: { objectPosition: `50% ${y}%` } };
  }
  return it.image ? { src: it.image, className: "w-full h-full object-contain" } : null;
}
