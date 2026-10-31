"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// MODELLER — kategorinin alt kırılımı (Bot › 01, Bot › 02 …). Her renk ayrı ürün olduğundan aynı modelin renklerini
// gruplar (Stok Yönetimi'nde model süzgeci / numara toplamları). Yalnız yönetim paneli; müşteriye gösterilmez.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { siteAlert, siteConfirm } from "@/components/ui/site-dialog";
import { Plus, Trash2, Loader2, Boxes, Check, X, Edit } from "lucide-react";

type Model = { id: string; category_id: string; code: string; name: string | null; used: number };

export default function ProductModelsCard() {
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [catId, setCatId] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ id: string; code: string; name: string } | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [c, m, p] = await Promise.all([
      supabase.from("categories").select("id, name").order("name"),
      (supabase as any).from("product_models").select("id, category_id, code, name").order("code"),
      (supabase as any).from("products").select("model_id").not("model_id", "is", null),
    ]);
    const used = new Map<string, number>();
    ((p.data as any[]) || []).forEach((r) => used.set(r.model_id, (used.get(r.model_id) ?? 0) + 1));
    setCats((c.data as any[]) || []);
    setModels(((m.data as any[]) || []).map((x) => ({ ...x, used: used.get(x.id) ?? 0 })));
    setLoading(false);
  }

  const dupMsg = (e: any) => /duplicate|unique/i.test(e?.message || "") ? "Bu kategoride aynı kod zaten var." : (e?.message || "hata");

  async function add() {
    if (!catId) { siteAlert({ message: "Önce kategori seç." }); return; }
    if (!code.trim()) { siteAlert({ message: "Model kodu gir (ör. 01)." }); return; }
    setSaving(true);
    const { error } = await (supabase as any).from("product_models").insert({ category_id: catId, code: code.trim(), name: name.trim() || null });
    setSaving(false);
    if (error) { siteAlert({ title: "Eklenemedi", message: dupMsg(error), tone: "danger" }); return; }
    setCode(""); setName("");
    load();
  }

  async function saveEdit() {
    if (!editing || !editing.code.trim()) return;
    const { error } = await (supabase as any).from("product_models")
      .update({ code: editing.code.trim(), name: editing.name.trim() || null, updated_at: new Date().toISOString() }).eq("id", editing.id);
    if (error) { siteAlert({ title: "Kaydedilemedi", message: dupMsg(error), tone: "danger" }); return; }
    setEditing(null);
    load();
  }

  async function remove(m: Model) {
    if (m.used) {
      siteAlert({ title: "Silinemez", message: `Bu model ${m.used} üründe kullanılıyor. Önce ürünlerden modeli kaldır.`, tone: "danger" });
      return;
    }
    if (!(await siteConfirm({ title: "Model silinsin mi?", message: `“${m.code}${m.name ? " · " + m.name : ""}” silinir.`, confirmText: "Sil", tone: "danger" }))) return;
    await (supabase as any).from("product_models").delete().eq("id", m.id);
    load();
  }

  const byCat = cats.map((c) => ({ ...c, models: models.filter((m) => m.category_id === c.id) })).filter((c) => c.models.length);

  return (
    <div className="space-y-4 pt-6 border-t">
      <div>
        <h3 className="text-lg font-semibold">Modeller</h3>
        <p className="text-sm text-muted-foreground">
          Kategorinin alt kırılımı (Bot › 01, Bot › 02). Aynı modelin farklı renklerini gruplar — Stok Yönetimi&apos;nde model süzgeci.
          Yalnız yönetim panelinde görünür, müşteriye gösterilmez. Ürüne model, ürün düzenleme ekranında seçilir.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium">Kategori</label>
          <select className="flex h-9 w-48 rounded-md border border-input bg-background px-2 text-sm" value={catId} onChange={(e) => setCatId(e.target.value)}>
            <option value="">Kategori seç</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Model kodu</label>
          <Input className="h-9 w-24" value={code} onChange={(e) => setCode(e.target.value)} placeholder="01" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Kısa ad (isteğe bağlı)</label>
          <Input className="h-9 w-56" value={name} onChange={(e) => setName(e.target.value)} placeholder="Klasik bağcıklı"
            onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        </div>
        <Button onClick={add} disabled={saving} className="gap-2 h-9">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Model ekle
        </Button>
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : byCat.length === 0 ? (
        <div className="py-8 text-center border-2 border-dashed rounded-xl text-sm text-muted-foreground">Henüz model tanımlanmamış.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {byCat.map((c) => (
            <Card key={c.id} className="overflow-hidden border-muted shadow-sm">
              <CardHeader className="bg-slate-50/50 border-b py-3 px-4">
                <CardTitle className="text-base flex items-center gap-2"><Boxes size={16} className="text-blue-600" /> {c.name}</CardTitle>
              </CardHeader>
              <CardContent className="py-2 px-4 divide-y">
                {c.models.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 py-1.5 text-sm">
                    {editing?.id === m.id ? (
                      <>
                        <Input className="h-7 w-16 text-xs" value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
                        <Input className="h-7 flex-1 text-xs" value={editing.name} placeholder="Kısa ad" onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); }} />
                        <button onClick={saveEdit} className="text-green-600 hover:text-green-700 p-1" title="Kaydet"><Check size={14} /></button>
                        <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600 p-1" title="Vazgeç"><X size={14} /></button>
                      </>
                    ) : (
                      <>
                        <span className="font-mono font-bold text-slate-800">{m.code}</span>
                        <span className="flex-1 text-slate-600 truncate">{m.name || <span className="text-slate-300">—</span>}</span>
                        <span className="text-[11px] text-slate-400 whitespace-nowrap">{m.used} ürün</span>
                        <button onClick={() => setEditing({ id: m.id, code: m.code, name: m.name || "" })} className="text-slate-400 hover:text-blue-600 p-1" title="Düzenle"><Edit size={13} /></button>
                        <button onClick={() => remove(m)} className="text-slate-300 hover:text-red-500 p-1" title="Sil (üründe kullanılıyorsa izin verilmez)"><Trash2 size={13} /></button>
                      </>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
