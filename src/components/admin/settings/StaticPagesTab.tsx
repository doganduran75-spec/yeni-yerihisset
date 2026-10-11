"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import RichTextEditor from "@/components/admin/RichTextEditor";
import { siteAlert, siteConfirm } from "@/components/ui/site-dialog";
import { STATIC_PAGES, PLACEHOLDERS, type StaticPageSlug } from "@/config/static-pages";
import { Loader2, Save, FileText, ExternalLink, Pencil, RotateCcw, Building2, X } from "lucide-react";

// Ayarlar › Sayfalar — hukuki metinler + Hakkımızda (tablo: static_pages) ve şirket künyesi (settings).
// Kaydedilmemiş sayfa koddaki varsayılanı gösterir (src/config/static-pages.ts). Yayındaki sayfa ~1 dk içinde güncellenir.
async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

const KUNYE: { key: string; label: string; hint?: string }[] = [
  { key: "company_title", label: "Şirket unvanı" },
  { key: "address", label: "Adres" },
  { key: "contact_email", label: "E-posta", hint: "Yönetici bildirimleri de bu adrese gider" },
  { key: "contact_phone", label: "Telefon" },
  { key: "company_tax_office", label: "Vergi dairesi" },
  { key: "company_tax_number", label: "Vergi numarası" },
  { key: "company_mersis", label: "MERSİS no" },
  { key: "company_kep", label: "KEP adresi" },
];

function KunyeCard() {
  const [v, setV] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    (async () => {
      const r = await fetch("/api/admin/settings", { headers: await authHeaders(), cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      const s = d?.settings || {};
      setV(Object.fromEntries(KUNYE.map((k) => [k.key, s[k.key] ?? ""])));
    })();
  }, []);
  async function save() {
    if (!v) return;
    setSaving(true);
    try {
      const r = await fetch("/api/admin/settings", {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ settings: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim() || null])) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || "Kaydedilemedi");
      siteAlert({ message: "Künye kaydedildi. Tüm sayfalarda ~1 dakika içinde güncellenir.", tone: "success" });
    } catch (e: any) {
      siteAlert({ title: "Kaydedilemedi", message: e?.message || "", tone: "danger" });
    } finally { setSaving(false); }
  }
  return (
    <Card className="shadow-sm border-muted">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Building2 size={18} /> Şirket künyesi</CardTitle>
        <CardDescription>Hukuki sayfalarda, İletişim'de ve arama motoru bilgilerinde kullanılır. Boş alan sitede &quot;(eklenecek)&quot; görünür.</CardDescription>
      </CardHeader>
      <CardContent>
        {!v ? <Loader2 className="animate-spin text-slate-400" /> : (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              {KUNYE.map((k) => (
                <div key={k.key} className={`space-y-1 ${k.key === "address" ? "sm:col-span-2" : ""}`}>
                  <label className="text-sm font-medium">{k.label}</label>
                  <Input value={v[k.key]} onChange={(e) => setV({ ...v, [k.key]: e.target.value })} />
                  {k.hint && <p className="text-[11px] text-muted-foreground">{k.hint}</p>}
                </div>
              ))}
            </div>
            <Button disabled={saving} onClick={save} className="gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Künyeyi kaydet
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type Row = { slug: StaticPageSlug; title: string; intro: string | null; body: string; draft: boolean; updated_at: string };

function Editor({ slug, row, onClose, onSaved }: { slug: StaticPageSlug; row: Row | null; onClose: () => void; onSaved: () => void }) {
  const def = STATIC_PAGES[slug];
  const [title, setTitle] = useState(row?.title ?? def.title);
  const [intro, setIntro] = useState(row?.intro ?? def.intro);
  const [body, setBody] = useState(row?.body ?? def.body);
  const [draft, setDraft] = useState(row ? row.draft : def.draftDefault);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("static_pages").upsert({
        slug, title: title.trim() || def.title, intro, body, draft, updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
      });
      if (error) throw error;
      siteAlert({ message: draft ? "Kaydedildi (taslak)." : "Kaydedildi ve yayında. Sitede ~1 dakika içinde görünür.", tone: "success" });
      onSaved();
    } catch (e: any) {
      siteAlert({ title: "Kaydedilemedi", message: e?.message || "", tone: "danger" });
    } finally { setSaving(false); }
  }

  async function reset() {
    if (!(await siteConfirm({ title: "Varsayılana dön", message: "Bu sayfadaki değişiklikler silinip ilk (varsayılan) metne dönülsün mü?", confirmText: "Evet, dön", tone: "danger" }))) return;
    setSaving(true);
    const { error } = await (supabase as any).from("static_pages").delete().eq("slug", slug);
    setSaving(false);
    if (error) { siteAlert({ title: "Olmadı", message: error.message, tone: "danger" }); return; }
    setTitle(def.title); setIntro(def.intro); setBody(def.body); setDraft(def.draftDefault);
    onSaved();
  }

  return (
    <Card className="shadow-sm border-blue-200">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Düzenle: {def.title}</CardTitle>
        <button onClick={onClose} aria-label="Kapat" className="p-1 text-slate-400 hover:text-slate-600"><X size={18} /></button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Başlık</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Giriş cümlesi</label>
          <textarea value={intro ?? ""} onChange={(e) => setIntro(e.target.value)} rows={2}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Metin</label>
          <RichTextEditor value={body} onChange={setBody} minHeight={360} placeholder="Sayfa metni…" />
        </div>
        <details className="rounded-lg border bg-slate-50 px-3 py-2 text-xs">
          <summary className="cursor-pointer font-bold text-slate-700">Yer tutucular (künyeden otomatik dolar)</summary>
          <ul className="mt-2 grid sm:grid-cols-2 gap-x-4 gap-y-1">
            {PLACEHOLDERS.map((p) => <li key={p.key}><code className="text-blue-700">{`{{${p.key}}}`}</code> — {p.label}</li>)}
          </ul>
        </details>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} className="mt-1" />
          <span><b>Taslak</b> — sayfada &quot;taslak&quot; uyarısı görünür, arama motorlarına kapalıdır. Metin onaylanınca işareti kaldır.</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={saving} onClick={save} className="gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Kaydet
          </Button>
          <Button variant="outline" disabled={saving} onClick={onClose}>Vazgeç</Button>
          {row && <Button variant="ghost" disabled={saving} onClick={reset} className="gap-1.5 text-slate-500 ml-auto"><RotateCcw size={14} /> Varsayılana dön</Button>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function StaticPagesTab() {
  const [rows, setRows] = useState<Record<string, Row> | null>(null);
  const [editing, setEditing] = useState<StaticPageSlug | null>(null);

  const load = useCallback(async () => {
    const { data } = await (supabase as any).from("static_pages").select("*");
    setRows(Object.fromEntries(((data as Row[]) || []).map((r) => [r.slug, r])));
  }, []);
  useEffect(() => { load(); }, [load]);

  const slugs = Object.keys(STATIC_PAGES) as StaticPageSlug[];
  return (
    <div className="space-y-6">
      <KunyeCard />
      <Card className="shadow-sm border-muted">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText size={18} /> Sayfalar</CardTitle>
          <CardDescription>Hukuki metinler ve Hakkımızda. Kaydedince sitede ~1 dakika içinde güncellenir.</CardDescription>
        </CardHeader>
        <CardContent>
          {!rows ? <Loader2 className="animate-spin text-slate-400" /> : (
            <div className="divide-y">
              {slugs.map((slug) => {
                const r = rows[slug];
                const draft = r ? r.draft : STATIC_PAGES[slug].draftDefault;
                return (
                  <div key={slug} className="flex items-center gap-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{r?.title || STATIC_PAGES[slug].title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        /{slug} · {r ? `son düzenleme ${new Date(r.updated_at).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : "varsayılan metin"}
                      </p>
                    </div>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${draft ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-700"}`}>{draft ? "Taslak" : "Yayında"}</span>
                    <Link href={`/${slug}`} target="_blank" className="p-2 text-slate-400 hover:text-slate-700" title="Görüntüle"><ExternalLink size={15} /></Link>
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditing(slug)}><Pencil size={13} /> Düzenle</Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      {editing && <Editor key={editing} slug={editing} row={rows?.[editing] ?? null} onClose={() => setEditing(null)} onSaved={() => { load(); }} />}
    </div>
  );
}
