"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Dashboard: "Pazaryeri Stok Senkronu" — stokların pazaryerlerinde güncel olduğundan
// emin olmak için tek bakış: sitedeki son stok değişikliği, kanal başına durum
// (güncel / gönderiliyor / gecikme / hata / kapalı) + son başarılı güncelleme,
// son birkaç senkron kaydı. Veri: /api/admin/marketplace/overview (dakikada bir tazelenir).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { ArrowRight, RefreshCw, Loader2 } from "lucide-react";

const HEALTH: Record<string, { dot: string; text: string; label: (c: any) => string }> = {
  ok:      { dot: "bg-green-500", text: "text-green-700", label: () => "Güncel" },
  waiting: { dot: "bg-amber-400 animate-pulse", text: "text-amber-700", label: (c) => `${c.waiting} gönderiliyor` },
  late:    { dot: "bg-orange-500", text: "text-orange-700", label: (c) => `${c.waiting} bekliyor (gecikme)` },
  error:   { dot: "bg-red-500", text: "text-red-700", label: (c) => `${c.failed} hatalı` },
  setup:   { dot: "bg-slate-300", text: "text-slate-500", label: () => "Bilgiler eksik" },
  off:     { dot: "bg-slate-300", text: "text-slate-500", label: () => "Kapalı" },
};

function ago(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} sn önce`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} sa önce`;
  return new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function MarketplaceSyncCard() {
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/admin/marketplace/overview", {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        cache: "no-store",
      });
      const j = await r.json();
      if (r.ok && j.ok) setD(j);
    } catch { /* kart kritik değil */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const anyOn = d?.channels?.some((c: any) => c.enabled);
  const worst = d?.channels?.some((c: any) => c.health === "error") ? "border-l-red-500"
    : d?.channels?.some((c: any) => c.health === "late") ? "border-l-orange-500"
    : anyOn ? "border-l-green-500" : "border-l-slate-300";

  return (
    <Card className={`order-first shadow-sm border-l-4 ${worst}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <RefreshCw size={18} className="text-slate-500" /> Pazaryeri Stok Senkronu
        </CardTitle>
        <div className="flex items-center gap-3">
          <button onClick={load} className="text-muted-foreground hover:text-slate-800" title="Yenile">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          </button>
          <Link href="/admin/stock-sync?tab=sync" className="text-xs text-muted-foreground hover:text-slate-800 flex items-center gap-1">
            Geçmiş <ArrowRight size={12} />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {!d ? (
          <p className="text-sm text-muted-foreground py-3 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Yükleniyor…</p>
        ) : (
          <>
            <div className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
              Sitede son stok değişikliği: <b className="text-slate-900">{ago(d.lastStockChange?.at ?? null)}</b>
              {d.lastStockChange && (
                <span className="block text-slate-400 truncate">
                  {d.lastStockChange.title}{d.lastStockChange.label ? ` · ${d.lastStockChange.label}` : ""} → stok {d.lastStockChange.stock}
                </span>
              )}
            </div>

            <div className="divide-y">
              {d.channels.map((c: any) => {
                const h = HEALTH[c.health] ?? HEALTH.off;
                return (
                  <div key={c.channel} className="flex items-center gap-2 py-2">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${h.dot}`} />
                    <span className="text-sm font-bold text-slate-800 w-24 shrink-0">{c.label}</span>
                    <span className={`text-xs font-semibold ${h.text} flex-1 min-w-0 truncate`}>{h.label(c)}</span>
                    <span className="text-[11px] text-slate-400 shrink-0" title="Son başarılı güncelleme">
                      {c.enabled ? `✓ ${ago(c.lastOkAt)}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>

            {d.recent?.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Son güncellemeler</p>
                {d.recent.map((r: any) => (
                  <div key={r.id} className="flex items-center gap-2 text-[11px]" title={r.message || undefined}>
                    <span className={r.ok ? "text-green-600" : "text-red-600"}>{r.ok ? "✓" : "✗"}</span>
                    <span className="font-mono text-slate-600 truncate min-w-0 flex-1">{r.listing_key}</span>
                    <span className="text-slate-500 shrink-0">{r.channel === "trendyol" ? "Trendyol" : "Hepsiburada"}</span>
                    <span className="font-bold text-slate-800 w-16 text-right shrink-0">{r.kind === "price" ? `₺${Math.round(Number(r.price ?? 0))}` : r.qty}</span>
                    <span className="text-slate-400 w-16 text-right shrink-0">{ago(r.created_at)}</span>
                  </div>
                ))}
              </div>
            )}

            {!anyOn && (
              <p className="text-xs text-muted-foreground">
                Pazaryeri senkronu kapalı. <Link href="/admin/settings?tab=integrations" className="text-blue-600 hover:underline">Ayarlar › Entegrasyonlar</Link>
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
