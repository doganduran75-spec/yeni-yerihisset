"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Ruler, Plus, Trash2, Loader2 } from "lucide-react";
import { siteAlert } from "@/components/ui/site-dialog";

// Marka ölçü tablosu düzenleyici (Ayarlar › Markalar › Ölçü tablosu). Ürün sayfasında
// "Beden tablosu · Numaramı bul" bunu kullanır (src/lib/size-chart.ts). Pay eklenmez: ölçü hangi
// aralıktaysa o numara. Bebek/çocuk için "büyüme payı": aralığın üst sınırına bu kadar mm yakınsa üst numara.
type Row = { label: string; alt: string; min_mm: string; max_mm: string; note: string };
const emptyRow = (): Row => ({ label: "", alt: "", min_mm: "", max_mm: "", note: "" });

export default function SizeChartEditor({ brand }: { brand: { id: string; name: string } }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exists, setExists] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [kids, setKids] = useState(false);
  const [grow, setGrow] = useState("0");
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!open) return;
    (supabase as any).from("size_charts").select("*").eq("brand_id", brand.id).maybeSingle().then(({ data }: any) => {
      setExists(!!data);
      setTitle(data?.title ?? `${brand.name} ölçü tablosu`);
      setNote(data?.note ?? "");
      setKids(!!data?.kids);
      setGrow(String(data?.grow_up_mm ?? 0));
      setRows(((data?.rows as any[]) || []).map((r) => ({ label: String(r.label ?? ""), alt: String(r.alt ?? ""), min_mm: String(r.min_mm ?? ""), max_mm: String(r.max_mm ?? ""), note: String(r.note ?? "") })));
      setLoading(false);
    });
  }, [open, brand.id, brand.name]);

  const set = (i: number, k: keyof Row, v: string) => setRows((x) => x.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  async function save() {
    const clean = rows.filter((r) => r.label.trim()).map((r) => ({
      label: r.label.trim(), ...(r.alt.trim() ? { alt: r.alt.trim() } : {}),
      min_mm: Number(r.min_mm), max_mm: Number(r.max_mm), ...(r.note.trim() ? { note: r.note.trim() } : {}),
    }));
    const bad = clean.find((r) => !(r.min_mm > 0) || !(r.max_mm >= r.min_mm));
    if (bad) { siteAlert({ message: `“${bad.label}” satırında ölçü aralığı hatalı (en az ≤ en çok, mm).`, tone: "danger" }); return; }
    const sorted = [...clean].sort((a, b) => a.min_mm - b.min_mm);
    const overlap = sorted.find((r, i) => i > 0 && r.min_mm <= sorted[i - 1].max_mm);
    if (overlap) { siteAlert({ message: `“${overlap.label}” aralığı bir öncekiyle çakışıyor.`, tone: "danger" }); return; }
    setSaving(true);
    const { error } = await (supabase as any).from("size_charts").upsert({
      brand_id: brand.id, title: title.trim() || null, note: note.trim() || null, kids, grow_up_mm: Math.max(0, Number(grow) || 0),
      rows: sorted, updated_at: new Date().toISOString(),
    }, { onConflict: "brand_id" });
    setSaving(false);
    if (error) { siteAlert({ message: error.message, tone: "danger" }); return; }
    siteAlert({ message: "Ölçü tablosu kaydedildi.", tone: "success" });
    setOpen(false);
  }

  async function remove() {
    setSaving(true);
    await (supabase as any).from("size_charts").delete().eq("brand_id", brand.id);
    setSaving(false);
    setOpen(false);
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="h-8 gap-1 text-olive-700" onClick={() => { setLoading(true); setOpen(true); }}><Ruler size={14} /> Ölçü tablosu</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{brand.name} — ölçü tablosu</DialogTitle></DialogHeader>
          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Başlık" />
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-sm font-medium"><input type="checkbox" checked={kids} onChange={(e) => setKids(e.target.checked)} /> Bebek / çocuk</label>
                  <label className="flex items-center gap-1.5 text-sm">Büyüme payı <Input value={grow} onChange={(e) => setGrow(e.target.value)} className="h-8 w-16" /> mm</label>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Ölçüler <b>mm</b>. “Numara/beden” üründeki varyant değeriyle aynı olmalı (ör. 40, 21,5 ya da M — buçuklu numara virgülle yazılabilir); “karşılık” (ör. beden harfi) varsa o da eşleşir.
                Pay eklenmez: ayak ölçüsü hangi aralıktaysa o numara önerilir. Büyüme payı &gt; 0 ise ölçü üst sınıra bu kadar yakınken bir üst numara önerilir.
              </p>
              <div className="space-y-2">
                <div className="hidden sm:grid grid-cols-[80px_80px_90px_90px_1fr_32px] gap-2 text-[10px] font-bold uppercase text-muted-foreground px-1">
                  <span>Numara/beden</span><span>Karşılık</span><span>En az mm</span><span>En çok mm</span><span>Not</span><span></span>
                </div>
                {rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-2 sm:grid-cols-[80px_80px_90px_90px_1fr_32px] gap-2">
                    <Input value={r.label} onChange={(e) => set(i, "label", e.target.value)} className="h-9" placeholder="40" />
                    <Input value={r.alt} onChange={(e) => set(i, "alt", e.target.value)} className="h-9" placeholder="—" />
                    <Input value={r.min_mm} onChange={(e) => set(i, "min_mm", e.target.value)} className="h-9" inputMode="numeric" placeholder="251" />
                    <Input value={r.max_mm} onChange={(e) => set(i, "max_mm", e.target.value)} className="h-9" inputMode="numeric" placeholder="255" />
                    <Input value={r.note} onChange={(e) => set(i, "note", e.target.value)} className="h-9" placeholder="ör. 8–12 ay" />
                    <Button variant="ghost" size="icon" className="h-9 w-8 text-red-500" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><Trash2 size={14} /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setRows((x) => [...x, emptyRow()])}><Plus size={14} /> Satır ekle</Button>
              </div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Tablonun altında görünecek not (ör. Genelde alıştığın numara uyar.)" className="w-full rounded-md border px-3 py-2 text-sm" />
            </div>
          )}
          <DialogFooter className="gap-2">
            {exists && <Button variant="outline" className="text-red-600 border-red-200 mr-auto" disabled={saving} onClick={remove}>Tabloyu kaldır</Button>}
            <Button onClick={save} disabled={saving || loading}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Kaydet"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
