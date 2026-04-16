"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { Plus, Trash2, Loader2, Tag } from "lucide-react";

type Brand = { id: string; name: string; slug: string; logo_url: string | null; created_at: string };

const toSlug = (text: string) =>
  text.toString().toLowerCase().trim()
    .replace(/\s+/g, "-").replace(/[ğĞ]/g, "g").replace(/[üÜ]/g, "u")
    .replace(/[şŞ]/g, "s").replace(/[ıİ]/g, "i").replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c").replace(/[^\w-]+/g, "").replace(/--+/g, "-");

export default function BrandsTab() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", logo_url: "" });

  useEffect(() => { fetch(); }, []);

  async function fetch() {
    setLoading(true);
    const { data } = await supabase.from("brands").select("*").order("name");
    setBrands(data || []);
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase.from("brands").insert({
        name: form.name,
        slug: toSlug(form.name),
        logo_url: form.logo_url || null,
      });
      if (error) throw error;
      setForm({ name: "", logo_url: "" });
      setOpen(false);
      fetch();
    } catch {
      alert("Marka eklenirken hata oluştu. Bu isim zaten mevcut olabilir.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu markayı silmek istediğinize emin misiniz? Markaya bağlı ürünler 'Markasız' olarak görünecektir.")) return;
    await supabase.from("brands").delete().eq("id", id);
    fetch();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Markalar</h3>
          <p className="text-sm text-muted-foreground">Ürünleriniz için markaları yönetin.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button className="gap-2"><Plus size={16} /> Yeni Marka</Button>} />
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader><DialogTitle>Yeni Marka Ekle</DialogTitle></DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Marka Adı</label>
                <Input required placeholder="Örn: Apple, Nike" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Logo URL (Opsiyonel)</label>
                <Input placeholder="https://..." value={form.logo_url} onChange={e => setForm({ ...form, logo_url: e.target.value })} />
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
          <CardTitle className="text-base">Marka Listesi</CardTitle>
          <CardDescription>Sistemdeki tüm markalar.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" /></div>
          ) : brands.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground border border-dashed rounded-lg text-sm">Henüz marka tanımlanmamış.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Marka Adı</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Tarih</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {brands.map(brand => (
                  <TableRow key={brand.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {brand.logo_url
                          ? <img src={brand.logo_url} alt="" className="h-5 w-5 object-contain rounded" />
                          : <Tag size={14} className="text-muted-foreground" />}
                        {brand.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{brand.slug}</TableCell>
                    <TableCell className="text-sm">{new Date(brand.created_at).toLocaleDateString("tr-TR")}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(brand.id)}>
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
