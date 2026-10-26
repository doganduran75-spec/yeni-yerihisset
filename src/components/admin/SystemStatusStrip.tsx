"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";

// PANONUN ÜST ŞERİDİ — sisteme göz ucuyla bak: her kontrol yeşil / sarı / kırmızı.
// Sorun varsa şeridin üstünde belirgin uyarı (satışa geçmeden önce görülsün). Ayrıntı: /admin/system
// Veri: /api/admin/system-status (aynı veriyi Sistem sayfası da kullanır → onData ile paylaşılır).
export type SystemStatus = { overall: "ok" | "warn" | "fail"; tiles: { key: string; label: string; status: "ok" | "warn" | "fail"; value: string; hint?: string; anchor: string; ack?: string[] }[]; details: any };

const ICON = {
  ok: <CheckCircle2 size={18} className="text-green-600 shrink-0" />,
  warn: <AlertTriangle size={18} className="text-amber-500 shrink-0" />,
  fail: <XCircle size={18} className="text-red-600 shrink-0" />,
};

export default function SystemStatusStrip({ onData, linkTo = "/admin/system" }: { onData?: (d: SystemStatus) => void; linkTo?: string }) {
  const [d, setD] = useState<SystemStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [acking, setAcking] = useState<string | null>(null);

  // "Evet, bendim": yeni IP'den SSH girişi uyarısını kapat (sunucu kaydeder; şerit yenilenir)
  async function ack(tileKey: string, keys: string[]) {
    setAcking(tileKey);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const h: Record<string, string> = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
      const r = await fetch("/api/admin/system-status", { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify({ action: "ack", keys }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      const j = await (await fetch("/api/admin/system-status", { headers: h, cache: "no-store" })).json();
      setD(j); onData?.(j);
    } catch (e: any) { setErr(e?.message || "kaydedilemedi"); } finally { setAcking(null); }
  }

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const r = await fetch("/api/admin/system-status", { headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}, cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        setD(j); onData?.(j);
      } catch (e: any) { setErr(e?.message || "okunamadı"); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (err) return <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">Sistem durumu okunamadı: {err}</div>;
  if (!d) return <div className="rounded-xl border bg-white p-3 text-sm text-muted-foreground flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Sistem kontrol ediliyor…</div>;

  const problems = d.tiles.filter((t) => t.status !== "ok");
  return (
    <section className="space-y-2">
      {problems.length > 0 && (
        <div className={`rounded-xl border-2 p-3 space-y-1.5 ${d.overall === "fail" ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}`}>
          <p className={`text-sm font-black ${d.overall === "fail" ? "text-red-800" : "text-amber-900"}`}>
            {d.overall === "fail" ? "Sistemde sorun var — önce buna bak" : "Sistemde dikkat edilmesi gereken bir şey var"}
          </p>
          {problems.map((t) => (
            <div key={t.key} className="flex flex-wrap items-start gap-2 text-sm">
              <Link href={`${linkTo}#${t.anchor}`} className="flex items-start gap-2 hover:underline min-w-0 flex-1">
                {ICON[t.status]}
                <span><b>{t.label}:</b> {t.value}{t.hint ? <span className="text-slate-600"> — {t.hint}</span> : null}</span>
              </Link>
              {t.ack?.length ? (
                <button type="button" disabled={acking === t.key} onClick={() => ack(t.key, t.ack!)}
                  className="shrink-0 rounded-lg border border-amber-400 bg-white px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50">
                  {acking === t.key ? "Kaydediliyor…" : "Evet, bendim"}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
      <div className="rounded-xl border bg-white px-3 py-2">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Sistem {problems.length === 0 && <span className="text-green-700 normal-case tracking-normal font-bold">· her şey yolunda</span>}</p>
          <Link href={linkTo} className="text-xs text-muted-foreground hover:text-slate-800 flex items-center gap-0.5">Ayrıntı <ChevronRight size={12} /></Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-x-3 gap-y-1.5">
          {d.tiles.map((t) => (
            <Link key={t.key} href={`${linkTo}#${t.anchor}`} title={t.value} className="flex items-center gap-2 min-w-0 rounded-lg px-1.5 py-1 hover:bg-slate-50">
              {ICON[t.status]}
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-800 truncate">{t.label}</span>
                <span className="block text-[11px] text-muted-foreground truncate">{t.value}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
