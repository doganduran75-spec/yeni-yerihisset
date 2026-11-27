"use client";

/* eslint-disable @next/next/no-img-element, @typescript-eslint/no-explicit-any */
// ELLE YORUM EKLE (kullanıcı 2026-11-19: eski yorumlar panelden girilebilsin; MIG 20261196). Siparişe bağlı değil:
// ürün + görünen ad + tarih + puan + yorum (+ en çok 5 görsel, "site" deposunun reviews/ klasörüne). Onaylı kaydedilir
// (yönetici giriyor) — ürün sayfasında hemen görünür; Yorumlar listesinde "Elle eklendi" etiketiyle.
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { shrinkImage, fileExt } from "@/lib/image-shrink";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Star, Upload, X } from "lucide-react";
import { REVIEW_ORIGINS, type ReviewOrigin } from "@/config/review-origins";

const MAX_IMAGES = 5;
const MAX_SIZE = 5 * 1024 * 1024;
const today = () => new Date().toISOString().slice(0, 10);

export default function AddReviewDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [products, setProducts] = useState<{ id: string; title: string }[] | null>(null);
  const [q, setQ] = useState("");
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState<ReviewOrigin>("eski_site");
  const [date, setDate] = useState(today());
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (supabase as any).from("products").select("id, title").order("title").limit(2000)
      .then(({ data, error }: any) => { if (error) setErr("Ürünler alınamadı: " + error.message); setProducts(data || []); });
  }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLocaleLowerCase("tr");
    const list = products || [];
    return s ? list.filter((p) => p.title?.toLocaleLowerCase("tr").includes(s)) : list;
  }, [products, q]);

  async function upload(files: FileList) {
    setErr("");
    setUploading(true);
    try {
      const next = [...images];
      for (const raw of Array.from(files)) {
        if (next.length >= MAX_IMAGES) break;
        if (!/^image\//.test(raw.type)) throw new Error("Yalnız görsel dosyası yüklenebilir.");
        const file = await shrinkImage(raw);
        if (file.size > MAX_SIZE) throw new Error(`${raw.name} 5 MB'tan büyük.`);
        const path = `reviews/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExt(file)}`;
        const { error } = await supabase.storage.from("site").upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        next.push(supabase.storage.from("site").getPublicUrl(path).data.publicUrl);
      }
      setImages(next);
    } catch (e: any) {
      setErr("Görsel yüklenemedi: " + (e?.message || e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save() {
    setErr("");
    if (!productId) return setErr("Ürünü seç.");
    if (!name.trim()) return setErr("Yorumu yapanın adını yaz (sitede böyle görünür, ör. Ayşe K.).");
    if (!comment.trim()) return setErr("Yorum metnini yaz.");
    if (date > today()) return setErr("Tarih bugünden sonra olamaz.");
    setSaving(true);
    const { error } = await (supabase as any).from("order_reviews").insert({
      product_id: productId,
      author_name: name.trim().slice(0, 60),
      origin,
      rating_overall: rating,
      comment: comment.trim().slice(0, 2000),
      images,
      created_at: new Date(`${date}T12:00:00`).toISOString(),
      is_approved: true,
      source: "manual",
    });
    setSaving(false);
    if (error) return setErr("Kaydedilemedi: " + error.message);
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[640px] max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Yorum ekle</DialogTitle></DialogHeader>
        <p className="text-xs text-slate-500 -mt-2">Eski yorumlar için. Onaylı kaydedilir, ürün sayfasında hemen görünür.</p>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Ürün</label>
            <Input placeholder="Ürün ara…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9" />
            {!products ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : (
              <select size={6} value={productId} onChange={(e) => setProductId(e.target.value)}
                className="w-full border rounded-md text-sm p-1 bg-white">
                {shown.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Kaynak <span className="font-normal text-slate-500">— sitede adın yanında görünür</span></label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(REVIEW_ORIGINS) as ReviewOrigin[]).map((k) => (
                <button key={k} type="button" onClick={() => setOrigin(k)}
                  className={`px-3 py-1.5 rounded-full text-sm border ${origin === k ? "bg-olive-600 text-white border-olive-600" : "bg-white text-slate-600 border-slate-200 hover:border-olive-300"}`}>
                  {REVIEW_ORIGINS[k].label}
                </button>
              ))}
            </div>
            {REVIEW_ORIGINS[origin].badge && <p className="text-xs text-slate-500">Sitede: “{name.trim() || "Ad"} · {REVIEW_ORIGINS[origin].badge}”</p>}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Yorumu yapan (sitede görünen ad)</label>
              <Input placeholder="Ayşe K." value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tarih</label>
              <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className="h-9" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Puan</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} type="button" onClick={() => setRating(s)} aria-label={`${s} yıldız`}>
                  <Star size={26} className={s <= rating ? "fill-amber-400 text-amber-400" : "text-slate-200"} />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Yorum</label>
            <textarea rows={4} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000}
              className="w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-olive-400" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Görseller <span className="font-normal text-slate-500">(isteğe bağlı, en çok {MAX_IMAGES})</span></label>
            <div className="flex flex-wrap gap-2 items-center">
              {images.map((src) => (
                <div key={src} className="relative w-20 h-20 rounded-lg overflow-hidden border">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setImages((l) => l.filter((x) => x !== src))} title="Kaldır"
                    className="absolute top-1 right-1 rounded-full bg-white/90 w-5 h-5 grid place-items-center shadow"><X size={12} /></button>
                </div>
              ))}
              {images.length < MAX_IMAGES && (
                <>
                  <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); }} />
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={uploading} onClick={() => fileRef.current?.click()}>
                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Görsel yükle
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {err && <p className="text-sm font-semibold text-red-600">{err}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Vazgeç</Button>
          <Button type="button" onClick={save} disabled={saving || uploading}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Kaydet"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
