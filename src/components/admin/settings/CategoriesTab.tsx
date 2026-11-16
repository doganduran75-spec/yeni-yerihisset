"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { Plus, Trash2, Loader2, Bookmark, FileText } from "lucide-react";
import ListPageContentDialog from "./ListPageContentDialog";

type Category = { id: string; name: string; slug: string; created_at: string; intro?: string | null; faq?: any; sort_order?: number | null };

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

  useEffect(() => { fetch(); }, []);

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
          <CardTitle className="text-base">Kategori Listesi</CardTitle>
          <CardDescription>Sistemdeki tüm ürün kategorileri. “Sıra”: mağazada küçük sayı önce gelir (kategori düğmeleri ve “Hepsi” listesindeki ürünler).</CardDescription>
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
      {contentFor && <ListPageContentDialog table="categories" row={contentFor} onClose={() => setContentFor(null)} onSaved={() => { setContentFor(null); fetch(); }} />}
    </div>
  );
}
