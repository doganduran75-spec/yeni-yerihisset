"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { siteAlert } from "@/components/ui/site-dialog";
import { Loader2, Plus, Trash2 } from "lucide-react";

// Kategori / marka sayfasının tanıtım metni + SSS (migration 20261114). Sayfada başlığın altında giriş, en altta
// soru-cevap (+ FAQPage yapısal verisi). Kısa, net, gerçek bilgi: yapay zekâ ve arama motoru "bu sayfa ne?" sorusunu buradan anlar.
export type FaqItem = { q: string; a: string };

export default function ListPageContentDialog({ table, row, onClose, onSaved }: {
  table: "categories" | "brands";
  row: { id: string; name: string; slug: string; intro?: string | null; faq?: FaqItem[] | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [intro, setIntro] = useState(row.intro ?? "");
  const [faq, setFaq] = useState<FaqItem[]>(Array.isArray(row.faq) ? row.faq : []);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const clean = faq.map((f) => ({ q: f.q.trim(), a: f.a.trim() })).filter((f) => f.q && f.a);
    const { error } = await (supabase as any).from(table).update({ intro: intro.trim() || null, faq: clean.length ? clean : null }).eq("id", row.id);
    setSaving(false);
    if (error) { siteAlert({ title: "Kaydedilemedi", message: error.message, tone: "danger" }); return; }
    siteAlert({ message: "Kaydedildi. Sayfada ~1 dakika içinde görünür.", tone: "success" });
    onSaved();
  }

  const path = table === "categories" ? `/kategori/${row.slug}` : `/marka/${row.slug}`;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Sayfa metni: {row.name}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-xs text-muted-foreground">Sayfa: <a href={path} target="_blank" rel="noreferrer" className="text-blue-600 underline">{path}</a></p>
          <div className="space-y-1">
            <label className="text-sm font-medium">Tanıtım metni (başlığın altında, 2–4 cümle)</label>
            <textarea value={intro} onChange={(e) => setIntro(e.target.value)} rows={4}
              placeholder="Ör: Dodura, İstanbul'da el yapımı üretilen deri barefoot ayakkabı markasıdır. Tabanı 5,5 mm kauçuk…"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Sık sorulan sorular</label>
              <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => setFaq([...faq, { q: "", a: "" }])}><Plus size={13} /> Soru ekle</Button>
            </div>
            {faq.length === 0 && <p className="text-xs text-muted-foreground">Henüz soru yok. Müşterilerin en sık sorduğu 3–5 soruyu ekle.</p>}
            {faq.map((f, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-2">
                <div className="flex gap-2">
                  <Input value={f.q} onChange={(e) => setFaq(faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} placeholder="Soru" />
                  <Button type="button" variant="ghost" size="icon" className="text-red-500 shrink-0" onClick={() => setFaq(faq.filter((_, j) => j !== i))}><Trash2 size={14} /></Button>
                </div>
                <textarea value={f.a} onChange={(e) => setFaq(faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} rows={2} placeholder="Cevap"
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Vazgeç</Button>
          <Button disabled={saving} onClick={save}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Kaydet"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
