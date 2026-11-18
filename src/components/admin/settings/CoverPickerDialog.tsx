"use client";

/* eslint-disable @next/next/no-img-element, @typescript-eslint/no-explicit-any */
// KAPAK GÖRSELİ SEÇİMİ (kullanıcı 2026-11-17): kategori kutusu (ana sayfa, kare) ve mağaza kartı (/magaza, 16:10) için en
// çok 3 görsel. Adaylar o kategorinin / mağazanın ürün görselleri; her aday SİTEDEKİ ORANDA ve aynı kırpmayla gösterilir
// (object-cover, ortadan) → "sonuçta nasıl görünecek" seçerken görülür. Sitede her ziyarette seçilenlerden biri çıkar
// (src/components/RotatingCover.tsx). Hiç seçilmezse eski davranış: stoktaki son ürünün görseli.
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";

export type CoverCandidate = { src: string; name: string };
export const MAX_COVERS = 3;

export default function CoverPickerDialog({ title, aspect, previewWidth, label, sublabel, initial, loadCandidates, onSave, onClose }: {
  title: string;
  aspect: "1 / 1" | "16 / 10";       // sitedeki kutunun oranı
  previewWidth: number;              // önizleme genişliği (sitedeki yaklaşık boyut, px)
  label: string;                     // kutunun altındaki başlık (önizlemede)
  sublabel?: string;
  initial: string[];
  loadCandidates: () => Promise<CoverCandidate[]>;
  onSave: (covers: string[]) => Promise<string | null>; // hata metni ya da null
  onClose: () => void;
}) {
  const [cands, setCands] = useState<CoverCandidate[] | null>(null);
  const [sel, setSel] = useState<string[]>(initial.slice(0, MAX_COVERS));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [loadErr, setLoadErr] = useState("");

  useEffect(() => {
    let live = true;
    loadCandidates().then((c) => { if (live) setCands(c); })
      .catch((e) => { if (live) { setCands([]); setLoadErr(String(e?.message || e)); } });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- adaylar pencere açılınca bir kez yüklenir

  function toggle(src: string) {
    setErr("");
    setSel((cur) => cur.includes(src) ? cur.filter((s) => s !== src) : cur.length >= MAX_COVERS ? cur : [...cur, src]);
  }

  async function save() {
    setSaving(true); setErr("");
    const e = await onSave(sel);
    setSaving(false);
    if (e) setErr(e); else onClose();
  }

  // Seçilmiş ama artık aday listesinde olmayan (ürün silinmiş / görsel değişmiş) görseller de seçili görünür
  const all: CoverCandidate[] = cands ? [...sel.filter((s) => !cands.some((c) => c.src === s)).map((src) => ({ src, name: "önceden seçilen" })), ...cands] : [];

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[920px] max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-800">Sitede böyle görünecek <span className="font-normal text-slate-500">— en çok {MAX_COVERS} görsel; her ziyarette biri gösterilir</span></p>
          {sel.length === 0 ? (
            <p className="text-xs text-slate-500 border border-dashed rounded-lg px-3 py-4">Seçim yok: sitede stoktaki son ürünün görseli kendiliğinden çıkar. Aşağıdan görsele dokunarak seç.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {sel.map((src, i) => (
                <div key={src} className="rounded-2xl overflow-hidden bg-white border" style={{ width: previewWidth }}>
                  <div className="relative bg-[#F3EFEA]" style={{ aspectRatio: aspect }}>
                    <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    <span className="absolute top-2 left-2 rounded-full bg-olive-700 text-white text-xs font-bold w-6 h-6 grid place-items-center">{i + 1}</span>
                    <button type="button" onClick={() => toggle(src)} title="Seçimden çıkar"
                      className="absolute top-2 right-2 rounded-full bg-white/90 text-slate-700 w-7 h-7 grid place-items-center shadow"><X size={14} /></button>
                  </div>
                  <div className="px-3 py-2">
                    <p className="text-sm font-bold text-slate-900 leading-tight">{label}</p>
                    {sublabel && <p className="text-xs text-slate-500">{sublabel}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2 pt-2">
          <p className="text-sm font-semibold text-slate-800">Ürün görselleri <span className="font-normal text-slate-500">— sitedeki kırpmayla gösteriliyor</span></p>
          {!cands ? (
            <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" /></div>
          ) : all.length === 0 ? (
            <p className={`text-xs ${loadErr ? "text-red-600 font-semibold" : "text-slate-500"}`}>{loadErr ? `Ürün görselleri alınamadı: ${loadErr}` : "Bu bölümde görseli olan ürün yok."}</p>
          ) : (
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${aspect === "1 / 1" ? 120 : 170}px, 1fr))` }}>
              {all.map((c) => {
                const n = sel.indexOf(c.src);
                const full = n < 0 && sel.length >= MAX_COVERS;
                return (
                  <button key={c.src} type="button" onClick={() => toggle(c.src)} disabled={full} title={c.name}
                    className={`relative rounded-xl overflow-hidden border-2 text-left transition ${n >= 0 ? "border-olive-600 ring-2 ring-olive-200" : "border-transparent hover:border-slate-300"} ${full ? "opacity-40 cursor-not-allowed" : ""}`}>
                    <div className="relative bg-[#F3EFEA]" style={{ aspectRatio: aspect }}>
                      <img src={c.src} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                      {n >= 0 && <span className="absolute top-1.5 left-1.5 rounded-full bg-olive-700 text-white text-xs font-bold w-6 h-6 grid place-items-center">{n + 1}</span>}
                    </div>
                    <p className="px-1.5 py-1 text-[11px] text-slate-600 truncate">{c.name}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {err && <p className="text-sm font-semibold text-red-600">{err}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Vazgeç</Button>
          <Button type="button" onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Kaydet"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Ürünlerin tüm görselleri (aynı görsel bir kez), yeni ürün önce */
export function productImages(rows: any[]): CoverCandidate[] {
  const seen = new Set<string>();
  const out: CoverCandidate[] = [];
  for (const p of rows || []) {
    const imgs: string[] = [...(Array.isArray(p.images) ? p.images : []), p.image_url].filter(Boolean);
    for (const src of imgs) if (!seen.has(src)) { seen.add(src); out.push({ src, name: p.title || p.name || "" }); }
  }
  return out;
}
