"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Pazaryeri SENKRON GEÇMİŞİ: her kesinleşmiş gönderim (barkod/SKU, pazaryeri,
// adet, sonuç, tarih). Filtre: kanal, sonuç, barkod arama; 50'lik sayfalar.
// Veri: /api/admin/marketplace/log (180 gün saklanır).
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { Loader2, Search, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

const CH_LABEL: Record<string, string> = { trendyol: "Trendyol", hepsiburada: "Hepsiburada" };

export default function MarketplaceSyncLog({ initialChannel = "" }: { initialChannel?: string }) {
  const [channel, setChannel] = useState(initialChannel);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ rows: any[]; total: number; pageSize: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ page: String(page) });
      if (channel) sp.set("channel", channel);
      if (status) sp.set("status", status);
      if (qApplied) sp.set("q", qApplied);
      const r = await fetch(`/api/admin/marketplace/log?${sp}`, { headers: await authHeaders(), cache: "no-store" });
      const j = await r.json();
      if (r.ok && j.ok) setData(j);
    } finally {
      setLoading(false);
    }
  }, [channel, status, qApplied, page]);

  useEffect(() => { load(); }, [load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const sel = "h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm";

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Pazaryerlerine otomatik gönderilen her stok güncellemesinin sonucu. Stok sitede değişince birkaç saniye içinde buraya düşer.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={channel} onChange={(e) => { setChannel(e.target.value); setPage(0); }} className={sel}>
          <option value="">Tüm pazaryerleri</option>
          <option value="trendyol">Trendyol</option>
          <option value="hepsiburada">Hepsiburada</option>
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} className={sel}>
          <option value="">Tüm sonuçlar</option>
          <option value="ok">Başarılı</option>
          <option value="fail">Hatalı</option>
        </select>
        <form onSubmit={(e) => { e.preventDefault(); setQApplied(q.trim()); setPage(0); }} className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Barkod / SKU ara…" className="h-9 pl-8 w-56" />
        </form>
        <button onClick={load} className="h-9 px-3 rounded-lg border text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-1.5">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Yenile
        </button>
        {data && <span className="text-xs text-muted-foreground ml-auto">{data.total} kayıt</span>}
      </div>

      <Card className="border-none shadow-sm overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 font-bold">Tarih</th>
                <th className="px-3 py-2 font-bold">Pazaryeri</th>
                <th className="px-3 py-2 font-bold">Barkod / SKU</th>
                <th className="px-3 py-2 font-bold">Ürün</th>
                <th className="px-3 py-2 font-bold text-right">Adet</th>
                <th className="px-3 py-2 font-bold">Sonuç</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {!data ? (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground"><Loader2 size={16} className="animate-spin inline" /></td></tr>
              ) : data.rows.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">Kayıt yok.</td></tr>
              ) : data.rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                    {new Date(r.created_at).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap font-semibold">{CH_LABEL[r.channel] ?? r.channel}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.listing_key}</td>
                  <td className="px-3 py-2 text-slate-700 max-w-[240px] truncate">{r.title}{r.label ? ` · ${r.label}` : ""}</td>
                  <td className="px-3 py-2 text-right font-bold">{r.qty}</td>
                  <td className="px-3 py-2">
                    {r.ok
                      ? <span className="text-green-700 font-semibold">✓ Güncellendi</span>
                      : <span className="text-red-700 font-semibold" title={r.message || undefined}>✗ {r.message || "Hata"}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="h-8 w-8 rounded-lg border flex items-center justify-center disabled:opacity-40"><ChevronLeft size={14} /></button>
          <span className="text-muted-foreground">{page + 1} / {pages}</span>
          <button disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className="h-8 w-8 rounded-lg border flex items-center justify-center disabled:opacity-40"><ChevronRight size={14} /></button>
        </div>
      )}
    </div>
  );
}
