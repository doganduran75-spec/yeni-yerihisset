"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { Plus, Edit, Trash2, Loader2, FolderSearch } from "lucide-react";

type KBCategory = { id: string; name: string; slug: string };

const toSlug = (text: string) =>
  text.toString().toLowerCase().trim()
    .replace(/\s+/g, "-").replace(/[^\w-]+/g, "").replace(/--+/g, "-");

export default function KBCategoriesTab() {
  const [categories, setCategories] = useState<KBCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");

  useEffect(() => { fetch(); }, []);

  async function fetch() {
    setLoading(true);
    const { data } = await supabase.from("kb_categories").select("*").order("name");
    setCategories(data || []);
    setLoading(false);
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const slug = toSlug(name);
      if (editingId) {
        await supabase.from("kb_categories").update({ name, slug }).eq("id", editingId);
      } else {
        await supabase.from("kb_categories").insert({ name, slug });
      }
      setOpen(false);
      setName("");
      setEditingId(null);
      fetch();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu kategoriyi silmek istediğinize emin misiniz?")) return;
    await supabase.from("kb_categories").delete().eq("id", id);
    fetch();
  }

  function openAdd() { setEditingId(null); setName(""); setOpen(true); }
  function openEdit(cat: KBCategory) { setEditingId(cat.id); setName(cat.name); setOpen(true); }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Bilgi Bankası Kategorileri</h3>
          <p className="text-sm text-muted-foreground">Makalelerinizi organize etmek için kategoriler oluşturun.</p>
        </div>
        <Button className="gap-2" onClick={openAdd}><Plus size={16} /> Yeni Kategori</Button>
      </div>

      <Card className="shadow-sm border-muted">
        <CardContent className="p-0">
          {loading ? (
            <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" /></div>
          ) : categories.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground border border-dashed rounded-lg m-4 text-sm">Henüz kategori tanımlanmamış.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Kategori Adı</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map(cat => (
                  <TableRow key={cat.id}>
                    <TableCell><FolderSearch size={15} className="text-slate-400" /></TableCell>
                    <TableCell className="font-medium">{cat.name}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{cat.slug}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(cat)}><Edit size={14} /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(cat.id)}><Trash2 size={14} /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>{editingId ? "Kategoriyi Düzenle" : "Yeni Kategori Ekle"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Kategori Adı</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Örn: Kullanım Kılavuzları" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>İptal</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Kaydet"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
