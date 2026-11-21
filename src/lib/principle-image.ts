import type { CSSProperties } from "react";
import { getImageProps } from "next/image";

// PRENSİP KARTI GÖRSELİ (kullanıcı 2026-11-18, ortak dosya 2026-11-19): dik görsel (imageTall, telefonda tam ekran hikâye)
// yüklüyse kartlarda da o kullanılır — kartı doldurur (object-cover), görünen kısım panelde "Kartlarda görünen kısım"
// (focusY: 0 üst, 100 alt). Dik görsel yoksa eski davranış: yatay görsel (image) kırpılmadan sığdırılır.
// Kullananlar: ana sayfa prensip kartları (PrincipleCarousel, masaüstü + telefon) ve Hakkımızda › "Her ayakkabıda aradığımız".
// Sunucu bileşeni de çağırabilsin diye "use client" dosyasında değil.
export type PItem = { image?: string; imageTall?: string; focusY?: number; title: string };

/** Kartlarda kutu oranları — panel önizlemesi (HomeContentTab › PrincipleCrop) aynı oranları gösterir */
export const PRINCIPLE_CARD_RATIO = { desktop: "4 / 3", mobile: "10 / 7" } as const;

/**
 * Görseli Next'in görsel servisinden ekran boyuna göre küçültülmüş (AVIF/WebP) al (kullanıcı 2026-11-22: hikâye / prensip
 * görselleri ham yükleniyordu — her biri 1536×2752 JPEG, 2,3–3,2 MB; 5 hikâye ≈ 13 MB). sizes: görselin ekrandaki genişliği.
 * <img {...optimizedImg(src, "100vw")} /> — aynı src + sizes iki yerde kullanılırsa tarayıcı aynı dosyayı bir kez indirir.
 */
export function optimizedImg(src: string, sizes: string): { src: string; srcSet?: string; sizes?: string } {
  if (!/^(https?:)?\/\//.test(src) && !src.startsWith("/")) return { src }; // data: / blob: vb. olduğu gibi
  try {
    const { props } = getImageProps({ src, alt: "", width: 1536, height: 2752, sizes });
    return { src: props.src, srcSet: props.srcSet, sizes: props.sizes };
  } catch {
    return { src }; // izinli olmayan adres (remotePatterns dışı) → ham görsel
  }
}

export function principleCardImage(it: PItem, sizes = "(min-width: 768px) 20vw, 82vw"): { src: string; srcSet?: string; sizes?: string; className: string; style?: CSSProperties } | null {
  if (it.imageTall) {
    const y = Math.max(0, Math.min(100, Number(it.focusY ?? 50)));
    return { ...optimizedImg(it.imageTall, sizes), className: "w-full h-full object-cover", style: { objectPosition: `50% ${y}%` } };
  }
  return it.image ? { ...optimizedImg(it.image, sizes), className: "w-full h-full object-contain" } : null;
}
