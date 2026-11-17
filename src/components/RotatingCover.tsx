import Image from "next/image";

// KAPAK GÖRSELİ: panelde seçilen 1–3 görselden biri, HER ZİYARETTE farklısı (kullanıcı 2026-11-17).
// Sayfa önbellekli (ISR) olduğu için seçim sunucuda yapılamaz; tarayıcıda yapılırsa görsel yüklenince değişir (titreme).
// Bunun yerine: kök düzendeki küçük betik ilk açılışta <html data-cv="0–5"> yazar (src/app/layout.tsx), tüm görseller
// sayfada durur ama yalnız sıradaki görünür (globals.css › .yh-cv). 6 = 1, 2 ve 3'ün ortak katı → her adette eşit dağılır.
// Gizli görseller display:none + tembel yükleme → indirilmez. Betik çalışmadıysa ilk görsel görünür.
export default function RotatingCover({ images, alt, sizes, className }: {
  images: (string | null | undefined)[];
  alt: string;
  sizes: string;
  className?: string;
}) {
  const list = [...new Set(images.filter((s): s is string => !!s))].slice(0, 3);
  if (list.length === 0) return null;
  if (list.length === 1) return <Image src={list[0]} alt={alt} fill sizes={sizes} className={className} />;
  return (
    <>
      {list.map((src, i) => (
        <div key={src} className="yh-cv absolute inset-0"
          data-show={[0, 1, 2, 3, 4, 5].filter((n) => n % list.length === i).join(" ")}
          data-first={i === 0 ? "" : undefined}>
          <Image src={src} alt={alt} fill sizes={sizes} className={className} />
        </div>
      ))}
    </>
  );
}
