/* eslint-disable @next/next/no-img-element */
type Item = { title: string; image: string; labelLeft?: string; labelRight?: string };
/** Prensip görseli + (karşılaştırma görsellerinde) sol / sağ yarının üstünde "Geleneksel" / "Barefoot" etiketi.
 *  Yazı görselin içinde değil sitede (yapay zekâ görselinde Türkçe yazı bozulabiliyor; panelden değişir). */
export default function PrincipleImage({ it, big = false }: { it: Item; big?: boolean }) {
  const pill = (t: string, good: boolean) => (
    <span className={`rounded-full font-bold ${big ? "px-3.5 py-1 text-[14px]" : "px-2.5 py-0.5 text-[11.5px]"}`}
      style={{ background: good ? "#3F6D14" : "#8A847A", color: "#fff" }}>{t}</span>
  );
  return (
    <div className="relative w-full h-full">
      {it.image && <img src={it.image} alt={it.title} draggable={false} className="w-full h-full object-contain pointer-events-none" loading="lazy" />}
      {(it.labelLeft || it.labelRight) && (
        <div className={`absolute inset-x-0 grid grid-cols-2 ${big ? "top-3" : "top-2"}`}>
          <div className="flex justify-center">{it.labelLeft && pill(it.labelLeft, false)}</div>
          <div className="flex justify-center">{it.labelRight && pill(it.labelRight, true)}</div>
        </div>
      )}
    </div>
  );
}
