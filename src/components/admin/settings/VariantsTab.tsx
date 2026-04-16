"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { Plus, Edit, Trash2, Loader2, Layers } from "lucide-react";

type VariantGroup = {
  id: string;
  name: string;
  options?: VariantOption[];
};

type VariantOption = {
  id: string;
  group_id: string;
  value: string;
};

export default function VariantsTab() {
  const [groups, setGroups] = useState<VariantGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<VariantGroup | null>(null);
  const [groupName, setGroupName] = useState("");
  const [optionsText, setOptionsText] = useState("");

  useEffect(() => {
    fetchGroups();
  }, []);

  async function fetchGroups() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("variant_groups")
        .select("id, name, variant_options(id, value)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      setGroups(data.map((g) => ({ ...g, options: g.variant_options })) || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveGroup() {
    if (!groupName.trim()) return;
    try {
      let gId = editingGroup?.id;
      if (editingGroup) {
        await supabase
          .from("variant_groups")
          .update({ name: groupName })
          .eq("id", editingGroup.id);
      } else {
        const { data } = await supabase
          .from("variant_groups")
          .insert({ name: groupName })
          .select()
          .single();
        gId = data.id;
      }
      if (optionsText && gId) {
        const vals = optionsText
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v !== "");
        await supabase
          .from("variant_options")
          .insert(vals.map((v) => ({ group_id: gId, value: v })));
      }
      setIsDialogOpen(false);
      setGroupName("");
      setOptionsText("");
      fetchGroups();
    } catch (e) {
      console.error(e);
    }
  }

  async function handleDeleteGroup(id: string) {
    if (!confirm("Bu varyasyon grubunu ve tüm değerlerini silmek istediğinize emin misiniz?")) return;
    await supabase.from("variant_groups").delete().eq("id", id);
    fetchGroups();
  }

  async function handleDeleteOption(id: string) {
    await supabase.from("variant_options").delete().eq("id", id);
    fetchGroups();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Varyasyon Grupları</h3>
          <p className="text-sm text-muted-foreground">
            Ürünleriniz için Renk, Numara vb. seçenek grupları tanımlayın.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingGroup(null);
            setGroupName("");
            setOptionsText("");
            setIsDialogOpen(true);
          }}
          className="gap-2"
        >
          <Plus size={16} /> Yeni Grup
        </Button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : groups.length === 0 ? (
        <div className="py-12 text-center border-2 border-dashed rounded-xl text-muted-foreground">
          Henüz varyasyon grubu tanımlanmamış.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <Card key={group.id} className="overflow-hidden border-muted shadow-sm">
              <CardHeader className="bg-slate-50/50 border-b py-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Layers size={16} className="text-blue-600" />
                    {group.name}
                  </CardTitle>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditingGroup(group);
                        setGroupName(group.name);
                        setOptionsText("");
                        setIsDialogOpen(true);
                      }}
                    >
                      <Edit size={13} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-500 hover:text-red-700"
                      onClick={() => handleDeleteGroup(group.id)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="py-3 px-4">
                <div className="flex flex-wrap gap-1.5">
                  {group.options?.length ? (
                    group.options.map((opt) => (
                      <div
                        key={opt.id}
                        className="bg-white border rounded px-2 py-0.5 text-xs flex items-center gap-1.5 group/opt shadow-sm hover:border-blue-200"
                      >
                        {opt.value}
                        <button
                          onClick={() => handleDeleteOption(opt.id)}
                          className="text-slate-300 hover:text-red-500 opacity-0 group-hover/opt:opacity-100 transition-opacity"
                        >
                          <Trash2 size={9} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground italic">Değer eklenmemiş.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingGroup ? "Grubu Düzenle" : "Yeni Varyasyon Grubu"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Grup Adı</label>
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Örn: Renk, Beden, Numara"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Değerler (Virgülle ayırın)</label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder="Kırmızı, Mavi, Yeşil..."
              />
              <p className="text-[10px] text-muted-foreground">
                Mevcut değerlerin yanına yenilerini ekler.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              İptal
            </Button>
            <Button onClick={handleSaveGroup}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
