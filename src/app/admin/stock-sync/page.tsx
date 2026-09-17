"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Copy, ExternalLink, Check, Loader2, PackageX, Store, ClipboardList, Save } from "lucide-react";
import AdminOpsTabs from "@/components/admin/AdminOpsTabs";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export default function StockSyncPage() {
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [done, setDone] = useState<any[]>([]);
  const [tab, setTab] = useState<"tasks" | "channels" | "log">("tasks");
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/stock-sync", { headers: await authHeaders() });
    const d = await res.json();
    if (d.ok) { setChannels(d.channels); setPending(d.pending); setDone(d.done); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const chById = (id: string) => channels.find((c) => c.id === id);

  async function markDone(taskId: string) {
    setBusy(taskId);
    await fetch("/api/admin/stock-sync", {
      method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ action: "done", taskId }),
    });
    setBusy(null);
    load();
  }

  async function copyBarcode(bc: string, key: string) {
    try { await navigator.clipboard.writeText(bc); setCopied(key); setTimeout(() => setCopied(null), 1500); } catch { /* */ }
  }

  // Bekleyen görevleri birim (varyant/ürün) bazında grupla
  const groups = (() => {
    const m = new Map<string, { key: string; title: string; label: string; barcode: string | null; tasks: any[] }>();
    for (const t of pending) {
      const key = t.variant_id || t.product_id;
      if (!m.has(key)) m.set(key, { key, title: t.product_title || "—", label: t.variant_label || "", barcode: t.barcode, tasks: [] });
      m.get(key)!.tasks.push(t);
    }
    return [...m.values()];
  })();

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={32} /></div>;
  }

  return (
    <div className="space-y-6">
      <AdminOpsTabs active="marketplace" />
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><PackageX size={22} className="text-red-600" /> Pazaryeri Stok Görevleri</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Stok 0 olan ürünlerin pazaryeri (Trendyol, Hepsiburada, Amazon, Ozon) listelemelerini kapatma iş listesi.
          Barkodu kopyala → kanala git → stoğu 0 yap → “Yaptım”.
        </p>
      </div>

      <div className="flex gap-2 border-b">
        {([["tasks", `Görevler (${pending.length})`], ["channels", "Kanallar"], ["log", "Log"]] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={cn("px-4 py-2 text-sm font-bold border-b-2 -mb-px transition-colors",
              tab === k ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === "tasks" && (
        <div className="space-y-4">
          {groups.length === 0 ? (
            <Card className="border-none shadow-sm"><CardContent className="p-12 text-center text-muted-foreground">
              🎉 Bekleyen görev yok. Stok 0 olduğunda burada iş oluşur.
            </CardContent></Card>
          ) : groups.map((g) => (
            <Card key={g.key} className="border-none shadow-sm">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="font-black text-slate-900 truncate">{g.title}{g.label && <span className="text-slate-500 font-medium"> · {g.label}</span>}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {g.barcode ? (
                        <button onClick={() => copyBarcode(g.barcode!, g.key)}
                          className="inline-flex items-center gap-1.5 text-xs font-mono font-bold bg-slate-100 hover:bg-slate-200 rounded px-2 py-1 transition-colors">
                          {copied === g.key ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                          {g.barcode}
                        </button>
                      ) : <span className="text-xs text-muted-foreground italic">barkod yok</span>}
                      <span className="text-[11px] font-bold text-red-600 bg-red-50 rounded px-2 py-0.5">STOK 0</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {g.tasks.map((t) => {
                    const ch = chById(t.channel_id);
                    return (
                      <div key={t.id} className="flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 bg-white">
                        <Store size={13} className="text-slate-400" />
                        <span className="text-sm font-bold text-slate-800">{ch?.name ?? "Kanal"}</span>
                        {ch?.manage_url && (
                          <a href={ch.manage_url} target="_blank" rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800" title="Kanala git">
                            <ExternalLink size={14} />
                          </a>
                        )}
                        <Button size="sm" className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700 font-bold gap-1 ml-1"
                          disabled={busy === t.id} onClick={() => markDone(t.id)}>
                          {busy === t.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Yaptım
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === "channels" && (
        <ChannelsTab channels={channels} onSaved={load} />
      )}

      {tab === "log" && (
        <div className="space-y-2">
          {done.length === 0 ? (
            <Card className="border-none shadow-sm"><CardContent className="p-12 text-center text-muted-foreground">Henüz kapatılan görev yok.</CardContent></Card>
          ) : done.map((t) => (
            <Card key={t.id} className="border-none shadow-sm">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 truncate">{t.product_title}{t.variant_label && <span className="text-slate-500 font-medium"> · {t.variant_label}</span>}</p>
                  <p className="text-xs text-muted-foreground">
                    {chById(t.channel_id)?.name ?? "Kanal"} · {t.method === "api" ? "entegrasyonla güncellendi" : "manuel"}
                    {t.barcode && <span className="font-mono"> · {t.barcode}</span>}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{t.done_at ? new Date(t.done_at).toLocaleString("tr-TR") : ""}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelsTab({ channels, onSaved }: { channels: any[]; onSaved: () => void }) {
  const [rows, setRows] = useState<any[]>(channels);
  const [savingId, setSavingId] = useState<string | null>(null);
  useEffect(() => setRows(channels), [channels]);

  async function save(row: any) {
    setSavingId(row.id);
    await fetch("/api/admin/stock-sync", {
      method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ action: "update_channel", channelId: row.id, manage_url: row.manage_url ?? "", is_active: row.is_active }),
    });
    setSavingId(null);
    onSaved();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground flex items-center gap-1.5"><ClipboardList size={14} /> Her kanalın yönetim paneli linkini gir (görevdeki “kanala git” bunu açar). Kullanmadığın kanalı pasif yap.</p>
      {rows.map((c, i) => (
        <Card key={c.id} className="border-none shadow-sm">
          <CardContent className="p-4 flex flex-wrap items-center gap-3">
            <span className="font-black text-slate-900 w-28 shrink-0">{c.name}</span>
            <Input
              placeholder="https://... (yönetim paneli linki)"
              value={c.manage_url ?? ""}
              onChange={(e) => setRows((r) => r.map((x, j) => j === i ? { ...x, manage_url: e.target.value } : x))}
              className="flex-1 min-w-[220px] h-10 text-sm"
            />
            <label className="flex items-center gap-2 text-sm font-bold shrink-0">
              <input type="checkbox" checked={!!c.is_active}
                onChange={(e) => setRows((r) => r.map((x, j) => j === i ? { ...x, is_active: e.target.checked } : x))} />
              Aktif
            </label>
            <Button size="sm" className="h-10 gap-1.5 font-bold" disabled={savingId === c.id} onClick={() => save(c)}>
              {savingId === c.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Kaydet
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
