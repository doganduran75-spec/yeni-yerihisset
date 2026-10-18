"use client";

// REKLAM LİNKLERİ (kullanıcı kararları 2026-10-18): reklam doğrudan doğru mağazaya gitsin — araya hikâye /
// seçim ekranı girmez (ana sayfa hikâyesi gclid / fbclid / utm_… görünce açılmaz). Kampanya adı yazılır,
// kanal seçilir, hazır adres kopyalanır.
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Copy, Check, Link2 } from "lucide-react";
import { SEGMENTS, type Segment } from "@/config/segments";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";
const CHANNELS = {
  meta: { label: "Meta (Instagram / Facebook)", q: "utm_source=meta&utm_medium=paid_social" },
  google: { label: "Google Ads", q: "utm_source=google&utm_medium=cpc" },
  whatsapp: { label: "WhatsApp / mesaj", q: "utm_source=whatsapp&utm_medium=message" },
} as const;
type Channel = keyof typeof CHANNELS;

const slug = (s: string) => s.toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
  .replace(/ö/g, "o").replace(/ç/g, "c").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function AdLinksCard() {
  const [ch, setCh] = useState<Channel>("meta");
  const [camp, setCamp] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const c = slug(camp);
  const url = (path: string) => `${SITE}${path}?${CHANNELS[ch].q}${c ? `&utm_campaign=${c}` : ""}`;
  const copy = async (u: string) => {
    try { await navigator.clipboard.writeText(u); setCopied(u); setTimeout(() => setCopied(null), 1500); } catch { /* yok */ }
  };
  return (
    <Card className="shadow-sm border-muted">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Link2 size={20} className="text-olive-600" /> Reklam linkleri</CardTitle>
        <CardDescription>
          Reklamı doğrudan ilgili mağazaya bağla: ziyaretçi araya giriş ekranı görmeden numarasını seçer. Kampanya adı
          analitikte (Ziyaretçi yolculuğu, Google Analytics) bu reklamdan gelenleri ayırır.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CHANNELS) as Channel[]).map((k) => (
            <button key={k} type="button" onClick={() => setCh(k)}
              className={`rounded-full border px-3 h-8 text-sm font-semibold ${ch === k ? "border-olive-600 bg-olive-50 text-olive-800" : "border-slate-200 text-slate-600"}`}>
              {CHANNELS[k].label}
            </button>
          ))}
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Kampanya adı</label>
          <Input value={camp} onChange={(e) => setCamp(e.target.value)} placeholder="ör. Ekim ilkadım" className="max-w-sm" />
        </div>
        <div className="space-y-2">
          {(Object.keys(SEGMENTS) as Segment[]).map((seg) => {
            const u = url(SEGMENTS[seg].path);
            return (
              <div key={seg} className="flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2">
                <span className="text-sm font-bold text-slate-700 w-32 shrink-0">{SEGMENTS[seg].label}</span>
                <code className="flex-1 min-w-0 truncate text-xs text-slate-600">{u}</code>
                <button type="button" onClick={() => copy(u)} className="shrink-0 p-1.5 text-slate-500 hover:text-slate-900" title="Kopyala">
                  {copied === u ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                </button>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Belirli bir kategori için adrese <code>&amp;kategori=&lt;kategori-adresi&gt;</code>, belirli numara için <code>&amp;numara=40</code> ekleyebilirsin.
        </p>
      </CardContent>
    </Card>
  );
}
