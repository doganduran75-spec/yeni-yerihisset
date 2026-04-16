"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { Plus, Trash2, Loader2, ShieldCheck } from "lucide-react";

type Role = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};

export default function RolesTab() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", slug: "" });

  useEffect(() => {
    fetchRoles();
  }, []);

  async function fetchRoles() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("roles")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      setRoles(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddRole(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase.from("roles").insert({
        name: formData.name,
        slug: formData.slug.toLowerCase().replace(/\s+/g, "-"),
      });
      if (error) throw error;
      setFormData({ name: "", slug: "" });
      setIsDialogOpen(false);
      fetchRoles();
    } catch (e) {
      console.error(e);
      alert("Rol eklenirken hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRole(id: string) {
    if (!confirm("Bu rolü silmek istediğinize emin misiniz?")) return;
    try {
      await supabase.from("roles").delete().eq("id", id);
      fetchRoles();
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Kullanıcı Rolleri</h3>
          <p className="text-sm text-muted-foreground">
            Sisteme erişim yetkilerini gruplandırmak için roller tanımlayın.
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger
            render={
              <Button className="gap-2">
                <Plus size={16} /> Yeni Rol
              </Button>
            }
          />
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Yeni Rol Ekle</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddRole} className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Rol Adı</label>
                <Input
                  required
                  placeholder="Örn: Editör, Kargo Sorumlusu"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Slug (Kod)</label>
                <Input
                  required
                  placeholder="örn: editor"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  İptal
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Kaydet"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="shadow-sm border-muted">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tanımlı Roller</CardTitle>
          <CardDescription>Sistemdeki tüm yetki grupları.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
            </div>
          ) : roles.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground border border-dashed rounded-lg text-sm">
              Henüz rol tanımlanmamış.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rol Adı</TableHead>
                  <TableHead>Kod (Slug)</TableHead>
                  <TableHead>Tarih</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <ShieldCheck size={14} className="text-blue-600" />
                        {role.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {role.slug}
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(role.created_at).toLocaleDateString("tr-TR")}
                    </TableCell>
                    <TableCell className="text-right">
                      {role.slug !== "admin" && role.slug !== "customer" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDeleteRole(role.id)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      )}
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
