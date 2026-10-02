"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Admin dashboard — SUNUCU SAĞLIĞI. Sunucudaki scripts/server-health.sh 15 dakikada bir
// disk, bellek, konteynerler, site süreçleri, SSL, güncellemeler ve SSH girişlerini
// kontrol eder; yedek ve pazaryeri senkronu da eklenir (src/lib/server-health.ts).
// Kırmızı / "yeni IP'den giriş" olunca yöneticiye ayrıca e-posta gider.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { ServerCog, CheckCircle2, AlertTriangle, XCircle, Loader2, ChevronDown, ChevronUp } from "lucide-react";

type Check = { key: string; label: string; status: "ok" | "warn" | "fail"; value: string; hint: string };

function ago(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} saat önce` : `${Math.round(h / 24)} gün önce`;
}

const ICON = {
  ok: <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />,
  warn: <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />,
  fail: <XCircle size={14} className="text-red-600 shrink-0 mt-0.5" />,
};

export default function ServerHealthCard() {
  const [d, setD] = useState<{ status: "ok" | "warn" | "fail"; checkedAt: string | null; checks: Check[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showOk, setShowOk] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const r = await fetch("/api/admin/server-health", {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
          cache: "no-store",
        });
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error || "okunamadı");
        setD(j);
      } catch (e: any) {
        setErr(e?.message || "okunamadı");
      }
    })();
  }, []);

  const problems = d?.checks.filter((c) => c.status !== "ok") ?? [];
  const oks = d?.checks.filter((c) => c.status === "ok") ?? [];
  const border = !d ? "border-l-slate-300" : d.status === "fail" ? "border-l-red-500" : d.status === "warn" ? "border-l-amber-400" : "border-l-emerald-500";

  return (
    <Card className={`shadow-sm border-l-4 ${border}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2">
          <ServerCog size={18} className={d?.status === "fail" ? "text-red-500" : d?.status === "warn" ? "text-amber-500" : "text-emerald-600"} />
          Sunucu Sağlığı
        </CardTitle>
        {d && (
          d.status === "ok"
            ? <span className="flex items-center gap-1 text-xs font-bold text-emerald-600"><CheckCircle2 size={13} /> Sağlıklı</span>
            : d.status === "warn"
              ? <span className="flex items-center gap-1 text-xs font-bold text-amber-600"><AlertTriangle size={13} /> Dikkat</span>
              : <span className="flex items-center gap-1 text-xs font-bold text-red-600"><XCircle size={13} /> Sorun var</span>
        )}
      </CardHeader>
      <CardContent className="pt-0 space-y-2 text-sm">
        {err ? (
          <p className="text-xs text-muted-foreground">Durum okunamadı ({err}). Migration 20261010000001 çalıştırıldı mı?</p>
        ) : !d ? (
          <div className="flex items-center gap-2 text-muted-foreground py-2"><Loader2 size={14} className="animate-spin" /> Yükleniyor…</div>
        ) : (
          <>
            {problems.map((c) => (
              <div key={c.key} className={`rounded-xl p-2.5 ${c.status === "fail" ? "bg-red-50" : "bg-amber-50"}`}>
                <div className="flex gap-2">
                  {ICON[c.status]}
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 text-[13px]">{c.label}: <span className="font-normal">{c.value}</span></p>
                    {c.hint && <p className="text-xs text-slate-600 mt-0.5">→ {c.hint}</p>}
                  </div>
                </div>
              </div>
            ))}
            <button onClick={() => setShowOk((v) => !v)} className="w-full flex items-center justify-between text-xs text-slate-500 hover:text-slate-700 py-1">
              <span className="flex items-center gap-1.5"><CheckCircle2 size={13} className="text-emerald-600" /> {oks.length} kontrol sağlıklı</span>
              {showOk ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showOk && (
              <div className="space-y-1.5 pl-1">
                {oks.map((c) => (
                  <div key={c.key} className="flex gap-2 text-xs">
                    {ICON.ok}
                    <span><b className="text-slate-700">{c.label}:</b> <span className="text-slate-500">{c.value}</span></span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-400">
              {d.checkedAt ? `Son kontrol ${ago(d.checkedAt)} · 15 dakikada bir` : "Sunucu kontrolü henüz kurulmadı"} · sorun olursa e-posta gelir
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
