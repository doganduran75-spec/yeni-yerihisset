"use client";

// Bilgi Bankası makalesinde KAPAK GÖRSELİ seçimi + sitedeki kartın canlı önizlemesi (kullanıcı 2026-11-28: ilk görsel
// kartta alttan / üstten kırpılıyordu, ne olduğu anlaşılmıyordu). Kural ve kart: src/lib/kb-cover.ts + KbCover.
import { BookOpen, ChevronRight } from "lucide-react";
import ImageUploadInput from "@/components/admin/settings/ImageUploadInput";
import KbCover from "@/components/kb/KbCover";
import { contentImages, isOptimizable, kbCover, type KbCoverFit } from "@/lib/kb-cover";

export type KbCoverValue = { cover_image: string; cover_fit: KbCoverFit; cover_pos_y: number };

export default function KbCoverPicker({ value, onChange, content, videoUrl, title, category }: {
  value: KbCoverValue; onChange: (v: KbCoverValue) => void; content: string; videoUrl: string; title: string; category: string;
}) {
  const set = (p: Partial<KbCoverValue>) => onChange({ ...value, ...p });
  const imgs = contentImages(content).filter(isOptimizable).slice(0, 12);
  const cover = kbCover({ ...value, content, video_url: videoUrl });
  const auto = !value.cover_image;
  const text = (content || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  return (
    <div className="grid gap-5 md:grid-cols-[1fr_300px] rounded-lg border border-slate-200 bg-slate-50/60 p-4" data-kb-cover-picker>
      <div className="space-y-4 min-w-0">
        <div className="space-y-2">
          <p className="text-sm font-medium">Kapak görseli</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => set({ cover_image: "" })}
              className={`h-16 px-3 rounded-md border text-xs font-semibold ${auto ? "border-olive-600 ring-2 ring-olive-600/30 bg-white" : "border-slate-200 bg-white text-slate-500"}`}>
              Otomatik<br /><span className="font-normal">(yazıdaki ilk görsel)</span>
            </button>
            {imgs.map((src) => (
              <button key={src} type="button" onClick={() => set({ cover_image: src })} title="Kapak yap"
                className={`h-16 w-16 rounded-md overflow-hidden border bg-white ${value.cover_image === src ? "border-olive-600 ring-2 ring-olive-600/30" : "border-slate-200"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Yazıdaki görsellerden birine tıkla ya da yazıda olmayan ayrı bir kapak yükle:</p>
          <ImageUploadInput value={value.cover_image} onChange={(v) => set({ cover_image: v })} folder="kb-cover" />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Kartta nasıl görünsün?</p>
          <div className="flex gap-2">
            {([["cover", "Kartı doldur (kırpılır)"], ["contain", "Görselin tamamı"]] as const).map(([f, l]) => (
              <button key={f} type="button" onClick={() => set({ cover_fit: f })}
                className={`h-9 px-3 rounded-md border text-xs font-semibold ${value.cover_fit === f ? "border-olive-600 bg-olive-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}>
                {l}
              </button>
            ))}
          </div>
          {value.cover_fit === "cover" ? (
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Görünecek kısım: kaydırarak görselin üstünü / ortasını / altını seç</span>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                Üst
                <input type="range" min={0} max={100} step={1} value={value.cover_pos_y} data-kb-cover-pos
                  onChange={(e) => set({ cover_pos_y: Number(e.target.value) })} className="flex-1 accent-olive-600" />
                Alt
              </div>
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">Görselin tamamı görünür; kenarlardaki boşluk aynı görselin bulanık hâliyle dolar.</p>
          )}
        </div>
      </div>

      {/* Sitedeki kartın aynısı */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-slate-500">Sitede böyle görünecek</p>
        <div className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
          <div className="aspect-[16/9] overflow-hidden bg-olive-50 relative">
            {cover ? <KbCover cover={cover} alt={title} sizes="300px" /> : (
              <div className="w-full h-full bg-gradient-to-br from-olive-50 to-olive-100 flex items-center justify-center">
                <BookOpen size={40} className="text-olive-300" strokeWidth={1} />
              </div>
            )}
          </div>
          <div className="p-5 space-y-3">
            {category && <span className="inline-block text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded border bg-olive-50 text-olive-700 border-olive-200">{category}</span>}
            <h3 className="font-black text-slate-900 text-base leading-snug line-clamp-2">{title || "Başlık"}</h3>
            <p className="text-xs text-slate-500 font-medium leading-relaxed line-clamp-3">{text.length > 140 ? text.slice(0, 140) + "…" : text}</p>
            <div className="flex items-center gap-1 text-xs font-black text-olive-600 uppercase tracking-wide pt-1">
              Devamını Oku <ChevronRight size={13} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
