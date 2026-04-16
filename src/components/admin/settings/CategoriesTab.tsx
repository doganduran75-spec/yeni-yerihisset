"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { Plus, Trash2, Loader2, Bookmark } from "lucide-react";

type Category = { id: string; name: string; slug: string; created_at: string };

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

  useEffect(() => { fetch(); }, []);

  async function fetch() {
    setLoading(true);
    const { data } = await supabase.from("categories").select("*").order("name");
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
          <CardDescription>Sistemdeki tüm ürün kategorileri.</CardDescription>
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
                  <TableHead>Kategori Adı</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Tarih</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map(cat => (
                  <TableRow key={cat.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Bookmark size={14} className="text-muted-foreground" />
                        {cat.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{cat.slug}</TableCell>
                    <TableCell className="text-sm">{new Date(cat.created_at).toLocaleDateString("tr-TR")}</TableCell>
                    <TableCell className="text-right">
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
    </div>
  );
}
