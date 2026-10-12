"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { siteAlert, siteConfirm } from "@/components/ui/site-dialog";
import { homeContent } from "@/config/homeContent";
import { mergeHomeContent } from "@/lib/home-content-merge";
import { Loader2, Save, Home, RotateCcw, ExternalLink } from "lucide-react";

// Ayarlar › Ana Sayfa — src/config/homeContent.ts'teki her metin / bağlantı / açık-kapalı ayarı burada düzenlenir.
// Kaydedilen içerik settings.home_content'e yazılır, varsayılanın üstüne geçer (src/lib/home-content.ts).
// Form varsayılan yapıdan otomatik oluşur → homeContent.ts'e yeni alan eklenince burada da çıkar.

const SECTION: Record<string, string> = {
  hero: "Karşılama", cards: "Seçim kartları", trust: "Güven çipleri", products: "Popüler ürünler", promo: "Reklam bandı",
  sizeFinder: "Doğru numarayı bul (mobil)", footer: "Alt bilgi (masaüstü ana sayfa)",
};
const LABEL: Record<string, string> = {
  badge: "Rozet (masaüstü)", question: "Soru", subtitleDesktop: "Alt yazı (masaüstü)", subtitleMobile: "Alt yazı (mobil)",
  promptMobile: "Mobil soru", continueLink: "\"Ana sayfaya devam\" bağlantısı", learn: "Rehber kartı", shop: "Mağaza kartı",
  pill: "Etiket", pillMobile: "Etiket (mobil)", title: "Başlık", titleMobile: "Başlık (mobil)", body: "Açıklama", cta: "Düğme yazısı",
  href: "Bağlantı adresi", label: "Yazı", icon: "Simge", trustMobileCount: "Mobilde kaç çip görünsün", eyebrow: "Üst yazı",
  eyebrowMobile: "Üst yazı (mobil)", seeAll: "\"Tümü\" yazısı", seeAllMobile: "\"Tümü\" yazısı (mobil)", limitDesktop: "Masaüstünde kaç ürün",
  limitMobile: "Mobilde kaç ürün", enabled: "Göster", subtitle: "Alt yazı", brandName: "Marka adı", brandDesc: "Marka açıklaması",
  columns: "Sütunlar", links: "Bağlantılar", newsletterTitle: "Bülten başlığı", newsletterBody: "Bülten açıklaması",
  copyright: "Telif satırı", tagline: "Slogan", legal: "Yasal bağlantılar",
};
const lbl = (k: string) => LABEL[k] ?? k;

function Field({ k, value, onChange }: { k: string; value: any; onChange: (v: any) => void }) {
  if (typeof value === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /> {lbl(k)}
      </label>
    );
  }
  if (typeof value === "number") {
    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">{lbl(k)}</label>
        <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} className="h-9 w-28" />
      </div>
    );
  }
  if (k === "icon") return null; // simge seçimi tasarımla ilgili; panelde değişmez
  const long = String(value).length > 70;
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-600">{lbl(k)}</label>
      {long ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2}
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-9" />
      )}
    </div>
  );
}

function Node({ k, value, onChange, depth }: { k: string; value: any; onChange: (v: any) => void; depth: number }) {
  if (Array.isArray(value)) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{lbl(k)}</p>
        <div className="space-y-2 pl-3 border-l-2 border-slate-100">
          {value.map((item, i) => (
            <Node key={i} k={`${i + 1}.`} value={item} depth={depth + 1}
              onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)))} />
          ))}
        </div>
      </div>
    );
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    const simple = keys.every((x) => typeof value[x] !== "object");
    return (
      <div className={depth > 0 ? "rounded-lg border border-slate-100 p-3 space-y-2" : "space-y-3"}>
        {depth > 0 && <p className="text-xs font-bold text-slate-500">{lbl(k)}</p>}
        <div className={simple ? "grid sm:grid-cols-2 gap-3" : "space-y-3"}>
          {keys.map((x) => (
            <Node key={x} k={x} value={value[x]} depth={depth + 1} onChange={(v) => onChange({ ...value, [x]: v })} />
          ))}
        </div>
      </div>
    );
  }
  return <Field k={k} value={value} onChange={onChange} />;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export default function HomeContentTab() {
  const [content, setContent] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/admin/settings", { headers: await authHeaders(), cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      setContent(mergeHomeContent(homeContent, d?.settings?.home_content ?? null));
    })();
  }, []);

  async function save(value: any) {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/settings", {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ settings: { home_content: value } }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || "Kaydedilemedi");
      siteAlert({ message: value ? "Kaydedildi. Ana sayfada ~1 dakika içinde görünür." : "Varsayılan metinlere dönüldü.", tone: "success" });
    } catch (e: any) {
      siteAlert({ title: "Kaydedilemedi", message: e?.message || "", tone: "danger" });
    } finally { setSaving(false); }
  }

  async function reset() {
    if (!(await siteConfirm({ title: "Varsayılana dön", message: "Ana sayfadaki tüm metin değişiklikleri silinip ilk metinlere dönülsün mü?", confirmText: "Evet, dön", tone: "danger" }))) return;
    await save(null);
    setContent(homeContent);
  }

  if (!content) return <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;
  return (
    <Card className="shadow-sm border-muted">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><Home size={18} /> Ana sayfa metinleri</CardTitle>
          <CardDescription>Karşılama, kartlar, güven çipleri, reklam bandı ve alt bilgi yazıları. Kaydedince ~1 dakika içinde yayında.</CardDescription>
        </div>
        <a href="/" target="_blank" rel="noreferrer" className="p-2 text-slate-400 hover:text-slate-700" title="Ana sayfayı aç"><ExternalLink size={16} /></a>
      </CardHeader>
      <CardContent className="space-y-6">
        {Object.keys(content).map((sec) => (
          <details key={sec} className="rounded-xl border p-4 group" open={sec === "hero"}>
            <summary className="cursor-pointer font-bold text-slate-800">{SECTION[sec] ?? sec}</summary>
            <div className="pt-4">
              <Node k={sec} value={content[sec]} depth={0} onChange={(v) => setContent({ ...content, [sec]: v })} />
            </div>
          </details>
        ))}
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button disabled={saving} onClick={() => save(content)} className="gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Kaydet
          </Button>
          <Button variant="ghost" disabled={saving} onClick={reset} className="gap-1.5 text-slate-500 ml-auto"><RotateCcw size={14} /> Varsayılana dön</Button>
        </div>
      </CardContent>
    </Card>
  );
}
