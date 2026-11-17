"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { Plus, Trash2, Loader2, Bookmark, FileText, Image as ImageIcon } from "lucide-react";
import ListPageContentDialog from "./ListPageContentDialog";
import CoverPickerDialog, { productImages } from "./CoverPickerDialog";
import { SEGMENTS, type Segment } from "@/config/segments";

type Category = { id: string; name: string; slug: string; created_at: string; intro?: string | null; faq?: any; sort_order?: number | null; cover_images?: string[] | null };

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

const toSlug = (text: string) =>
  text.toString().toLowerCase().trim()
    .replace(/\s+/g, "-").replace(/[ğĞ]/g, "g").replace(/[üÜ]/g, "u")
    .replace(/[şŞ]/g, "s").replace(/[ıİ]/g, "i").replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c").replace(/[^\w-]+/g, "").replace(/--+/g, "-");

export default function CategoriesTab() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [contentFor, setContentFor] = useState<Category | null>(null); // "Sayfa metni" (tanıtım + SSS)
  // Kapak görselleri (kullanıcı 2026-11-17, MIG 20261195): kategori kutusu (ana sayfa) + mağaza kartları (/magaza)
  const [coverFor, setCoverFor] = useState<Category | null>(null);
  const [segCoverFor, setSegCoverFor] = useState<Segment | null>(null);
  const [segCovers, setSegCovers] = useState<Record<string, string[]>>({});

  useEffect(() => { fetch(); loadSegCovers(); }, []);

  async function loadSegCovers() {
    try {
      const r = await window.fetch("/api/admin/settings", { headers: await authHeaders(), cache: "no-store" });
      const d = await r.json();
      setSegCovers(d?.settings?.segment_covers || {});
    } catch { /* kart boş görünür */ }
  }

  async function saveCategoryCovers(id: string, covers: string[]): Promise<string | null> {
    const { error } = await (supabase as any).from("categories").update({ cover_images: covers }).eq("id", id);
    if (error) return "Kaydedilemedi: " + error.message;
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, cover_images: covers } : c)));
    return null;
  }

  async function saveSegmentCovers(seg: Segment, covers: string[]): Promise<string | null> {
    const next = { ...segCovers, [seg]: covers };
    const r = await window.fetch("/api/admin/settings", {
      method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ settings: { segment_covers: next } }),
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); return "Kaydedilemedi: " + (d?.error || r.status); }
    setSegCovers(next);
    return null;
  }

  // Adaylar: kategorinin / mağazanın aktif ürünlerinin görselleri (yeni ürün önce)
  async function categoryCandidates(id: string) {
    const { data } = await (supabase as any).from("products").select("name, images, image_url, created_at")
      .eq("category_id", id).eq("is_active", true).order("created_at", { ascending: false }).limit(200);
    return productImages(data || []);
  }
  async function segmentCandidates(seg: Segment) {
    const { data } = await (supabase as any).from("products").select("name, images, image_url, created_at, categories!inner(segment)")
      .eq("categories.segment", seg).eq("is_active", true).order("created_at", { ascending: false }).limit(300);
    return productImages(data || []);
  }

  async function fetch() {
    setLoading(true);
    const { data } = await (supabase as any).from("categories").select("*").order("sort_order").order("name");
    setCategories(data || []);
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase.from("categories").insert({ name, slug: toSlug(name) });
      if (error) throw error;
      setName("");
      setOpen(false);
      fetch();
    } catch {
      alert("Kategori eklenirken hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  // Mağaza segmenti: Yetişkin / 0–4 Yaş İlkadım (/magaza/yetiskin, /magaza/ilkadim)
  async function setSegment(id: string, segment: string) {
    const { error } = await (supabase as any).from("categories").update({ segment }).eq("id", id);
    if (error) { alert("Kaydedilemedi: " + error.message); return; }
    setCategories((prev) => prev.map((c: any) => (c.id === id ? { ...c, segment } : c)));
  }

  // Mağazadaki sıra (kullanıcı 2026-11-16): küçük sayı önce — kategori düğmeleri ve "Hepsi" listesindeki ürünler bu sırayla
  async function setSort(id: string, value: string) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return;
    const { error } = await (supabase as any).from("categories").update({ sort_order: n }).eq("id", id);
    if (error) { alert("Kaydedilemedi: " + error.message); return; }
    setCategories((prev) => [...prev.map((c) => (c.id === id ? { ...c, sort_order: n } : c))]
      .sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || a.name.localeCompare(b.name, "tr")));
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu kategoriyi silmek istediğinize emin misiniz? Kategorideki ürünler kategorisiz kalacaktır.")) return;
    await supabase.from("categories").delete().eq("id", id);
    fetch();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Kategoriler</h3>
          <p className="text-sm text-muted-foreground">Ürünlerinizi gruplandırmak için kategorileri yönetin.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button className="gap-2"><Plus size={16} /> Yeni Kategori</Button>} />
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader><DialogTitle>Yeni Kategori Ekle</DialogTitle></DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Kategori Adı</label>
                <Input required placeholder="Örn: Mobilya, Aksesuar" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>İptal</Button>
                <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Kaydet"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="shadow-sm border-muted">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Mağaza kartlarının görseli</CardTitle>
          <CardDescription>/magaza sayfasındaki Yetişkin ve 0–4 Yaş İlkadım kartları. En çok 3 görsel seç; her ziyarette biri gösterilir. Seçmezsen stoktaki son ürünün görseli çıkar.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {(Object.keys(SEGMENTS) as Segment[]).map((seg) => {
            const list = segCovers[seg] || [];
            return (
              <button key={seg} type="button" onClick={() => setSegCoverFor(seg)}
                className="flex items-center gap-3 rounded-xl border bg-white px-3 py-2 hover:border-olive-400 text-left">
                <div className="flex -space-x-3">
                  {list.length ? list.map((src) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={src} src={src} alt="" className="w-12 h-[30px] rounded-md object-cover border-2 border-white" />
                  )) : <span className="w-12 h-[30px] rounded-md bg-slate-100 grid place-items-center"><ImageIcon size={14} className="text-slate-400" /></span>}
                </div>
                <div>
                  <p className="text-sm font-semibold">{SEGMENTS[seg].label}</p>
                  <p className="text-xs text-slate-500">{list.length ? `${list.length} görsel seçili` : "otomatik (seçim yok)"}</p>
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card className="shadow-sm border-muted">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Kategori Listesi</CardTitle>
          <CardDescription>Sistemdeki tüm ürün kategorileri. “Sıra”: mağazada küçük sayı önce gelir (kategori düğmeleri ve “Hepsi” listesindeki ürünler). “Kapak”: ana sayfadaki Kategoriler kutusunun görseli (en çok 3, her ziyarette biri).</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" /></div>
          ) : categories.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground border border-dashed rounded-lg text-sm">Henüz kategori tanımlanmamış.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20" title="Mağazada küçük sayı önce gelir">Sıra</TableHead>
                  <TableHead>Kategori Adı</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Mağaza</TableHead>
                  <TableHead>Tarih</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map(cat => (
                  <TableRow key={cat.id}>
                    <TableCell>
                      <input type="number" defaultValue={cat.sort_order ?? 100} key={`${cat.id}-${cat.sort_order}`} onBlur={(e) => { if (Number(e.target.value) !== (cat.sort_order ?? 100)) setSort(cat.id, e.target.value); }}
                        className="h-8 w-16 rounded-md border px-2 text-xs bg-white" title="Mağazada küçük sayı önce gelir (ör. kışın Bot 10, Ayakkabı 20, Babet 30, Aksesuar 40)" />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Bookmark size={14} className="text-muted-foreground" />
                        {cat.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{cat.slug}</TableCell>
                    <TableCell>
                      <select value={(cat as any).segment || "yetiskin"} onChange={(e) => setSegment(cat.id, e.target.value)} className="h-8 rounded-md border px-2 text-xs bg-white" title="Bu kategori hangi mağazada görünür">
                        <option value="yetiskin">Yetişkin</option>
                        <option value="ilkadim">0–4 Yaş İlkadım</option>
                      </select>
                    </TableCell>
                    <TableCell className="text-sm">{new Date(cat.created_at).toLocaleDateString("tr-TR")}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" className="h-8 gap-1 mr-1" onClick={() => setCoverFor(cat)} title="Ana sayfadaki kategori kutusunun görseli">
                        <ImageIcon size={13} /> Kapak{cat.cover_images?.length ? ` (${cat.cover_images.length})` : ""}
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 gap-1 mr-1" onClick={() => setContentFor(cat)}><FileText size={13} /> Sayfa metni</Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(cat.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {coverFor && (
        <CoverPickerDialog title={`Kapak görseli: ${coverFor.name}`} aspect="1 / 1" previewWidth={220}
          label={coverFor.name} sublabel={SEGMENTS[((coverFor as any).segment || "yetiskin") as Segment]?.label}
          initial={coverFor.cover_images || []} loadCandidates={() => categoryCandidates(coverFor.id)}
          onSave={(c) => saveCategoryCovers(coverFor.id, c)} onClose={() => setCoverFor(null)} />
      )}
      {segCoverFor && (
        <CoverPickerDialog title={`Mağaza kartı görseli: ${SEGMENTS[segCoverFor].label}`} aspect="16 / 10" previewWidth={340}
          label={SEGMENTS[segCoverFor].label} sublabel={SEGMENTS[segCoverFor].card}
          initial={segCovers[segCoverFor] || []} loadCandidates={() => segmentCandidates(segCoverFor)}
          onSave={(c) => saveSegmentCovers(segCoverFor, c)} onClose={() => setSegCoverFor(null)} />
      )}
      {contentFor && <ListPageContentDialog table="categories" row={contentFor} onClose={() => setContentFor(null)} onSaved={() => { setContentFor(null); fetch(); }} />}
    </div>
  );
}
