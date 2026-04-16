"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { Plus, Edit, Trash2, Loader2, Tags } from "lucide-react";

type TagGroup = {
  id: string;
  name: string;
  description: string | null;
  options: TagOption[];
};

type TagOption = {
  id: string;
  group_id: string;
  value: string;
};

export default function MemberTagsTab() {
  const [groups, setGroups] = useState<TagGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Group dialog
  const [groupDialog, setGroupDialog] = useState(false);
  const [editingGroup, setEditingGroup] = useState<TagGroup | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchGroups(); }, []);

  async function fetchGroups() {
    setLoading(true);
    const { data } = await supabase
      .from("member_tag_groups")
      .select("id, name, description, member_tag_options(id, group_id, value)")
      .order("created_at");
    setGroups(
      (data || []).map((g: any) => ({ ...g, options: g.member_tag_options || [] }))
    );
    setLoading(false);
  }

  async function handleSaveGroup() {
    if (!groupName.trim()) return;
    setSaving(true);
    try {
      let gId: string | undefined = editingGroup?.id;
      if (editingGroup) {
        const { error } = await supabase
          .from("member_tag_groups")
          .update({ name: groupName, description: groupDesc || null })
          .eq("id", editingGroup.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("member_tag_groups")
          .insert({ name: groupName, description: groupDesc || null })
          .select("id")
          .single();
        if (error || !data) throw error ?? new Error("Grup oluşturulamadı");
        gId = data.id;
      }
      if (optionsText.trim() && gId) {
        const vals = optionsText.split(",").map(v => v.trim()).filter(Boolean);
        await supabase
          .from("member_tag_options")
          .insert(vals.map(v => ({ group_id: gId, value: v })));
      }
      setGroupDialog(false);
      setGroupName(""); setGroupDesc(""); setOptionsText("");
      fetchGroups();
    } catch (err: any) {
      console.error("Grup kaydedilemedi:", err);
      alert("Grup kaydedilemedi: " + (err?.message ?? "Bilinmeyen hata"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteGroup(id: string) {
    if (!confirm("Bu etiket grubunu ve tüm seçeneklerini silmek istediğinize emin misiniz? Üyelere atanmış etiketler de silinir.")) return;
    await supabase.from("member_tag_groups").delete().eq("id", id);
    fetchGroups();
  }

  async function handleDeleteOption(id: string) {
    await supabase.from("member_tag_options").delete().eq("id", id);
    fetchGroups();
  }

  function openAdd() {
    setEditingGroup(null); setGroupName(""); setGroupDesc(""); setOptionsText("");
    setGroupDialog(true);
  }

  function openEdit(g: TagGroup) {
    setEditingGroup(g); setGroupName(g.name); setGroupDesc(g.description || ""); setOptionsText("");
    setGroupDialog(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Üye Etiketleri</h3>
          <p className="text-sm text-muted-foreground">
            Üyeleri segmentlemek için özel etiket grupları oluşturun (ör. Ayakkabı Numarası, İlgi Alanı).
          </p>
        </div>
        <Button className="gap-2" onClick={openAdd}>
          <Plus size={16} /> Yeni Etiket Grubu
        </Button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : groups.length === 0 ? (
        <div className="py-12 text-center border-2 border-dashed rounded-xl text-muted-foreground text-sm">
          Henüz etiket grubu tanımlanmamış.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {groups.map(group => (
            <Card key={group.id} className="overflow-hidden border-muted shadow-sm">
              <CardHeader className="bg-slate-50/50 border-b py-3 px-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Tags size={15} className="text-blue-600" /> {group.name}
                    </CardTitle>
                    {group.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{group.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(group)}>
                      <Edit size={13} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => handleDeleteGroup(group.id)}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="py-3 px-4">
                <div className="flex flex-wrap gap-1.5">
                  {group.options.length ? (
                    group.options.map(opt => (
                      <div key={opt.id} className="bg-white border rounded px-2 py-0.5 text-xs flex items-center gap-1.5 group/opt shadow-sm hover:border-blue-200">
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
                    <p className="text-xs text-muted-foreground italic">Seçenek eklenmemiş.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={groupDialog} onOpenChange={setGroupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGroup ? "Grubu Düzenle" : "Yeni Etiket Grubu"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Grup Adı</label>
              <Input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Örn: Ayakkabı Numarası" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Açıklama (Opsiyonel)</label>
              <Input value={groupDesc} onChange={e => setGroupDesc(e.target.value)} placeholder="Bu etiket ne için kullanılır?" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Seçenekler (Virgülle ayırın)</label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={optionsText}
                onChange={e => setOptionsText(e.target.value)}
                placeholder="36, 37, 38, 39, 40..."
              />
              <p className="text-[10px] text-muted-foreground">Mevcut seçeneklere yenilerini ekler.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialog(false)}>İptal</Button>
            <Button onClick={handleSaveGroup} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
