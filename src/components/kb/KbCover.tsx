// Bilgi Bankası kart kapağı — site listesi ve paneldeki önizleme AYNI bileşen (src/lib/kb-cover.ts).
// Üst kutu 16:9; "contain"de görselin tamamı, kenarlar aynı görselin bulanık hâliyle dolar.
import Image from "next/image";
import type { KbCoverInfo } from "@/lib/kb-cover";

export default function KbCover({ cover, alt, sizes = "(max-width: 768px) 100vw, 33vw", hover = false }: {
  cover: NonNullable<KbCoverInfo>; alt: string; sizes?: string; hover?: boolean;
}) {
  const zoom = hover ? " group-hover:scale-105 transition-transform duration-500" : "";
  if (cover.fit === "contain") {
    return (
      <>
        <Image src={cover.src} alt="" aria-hidden fill sizes={sizes} className="object-cover blur-xl scale-110 opacity-60" />
        <Image src={cover.src} alt={alt} fill sizes={sizes} className={`object-contain${zoom}`} data-kb-cover="contain" />
      </>
    );
  }
  return (
    <Image src={cover.src} alt={alt} fill sizes={sizes} className={`object-cover${zoom}`}
      style={{ objectPosition: `50% ${cover.posY}%` }} data-kb-cover="cover" />
  );
}
