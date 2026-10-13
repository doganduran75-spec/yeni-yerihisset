"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// PARAŞÜT ÜRÜN EŞLEŞTİRME — her numara Paraşüt’te ayrı ürün. "Paraşüt’ten çek ve eşleştir": Paraşüt ürün
// listesi alınır, site numarası barkoddan sonra SKU ile (Paraşüt’te kod ya da barkod alanı) eşleşir.
// Eşleşmeyene elle Paraşüt ürünü seçilebilir (korunur). "Paraşüt’ü siteyle aynı yap": seçili eşleşmelerde
// Paraşüt ürününün kodu = site SKU, barkodu = site barkodu (Paraşüt’e yazar, onaylı).
// Fatura kesilirken (2. adım) kalemler bu eşleşmeyle Paraşüt ürününe bağlanır.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { siteAlert, siteConfirm } from "@/components/ui/site-dialog";
import { sortByVariantValue } from "@/lib/variant-sort";
import { Loader2, RefreshCw, ArrowLeft, Search, Upload } from "lucide-react";

async function api(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch("/api/admin/parasut", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Paraşüt hatası");
  return j;
}

type PP = { parasut_id: string; code: string | null; barcode: string | null; name: string | null; stock_count: number | null; archived: boolean };
type Row = { id: string; title: string; value: string; sku: string; barcode: string; active: boolean; pid: string | null };
const K = (v: unknown) => String(v ?? "").trim().toUpperCase();

export default function ParasutMatchPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [pps, setPps] = useState<PP[]>([]);
  const [synced, setSynced] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "none" | "diff" | "ok">("none");
  const [sel, setSel] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const sb = supabase as any;
    const [{ data: prods }, pp] = await Promise.all([
      sb.from("products").select("title, is_active, product_variants(id, sku, barcode, is_active, parasut_product_id, variant_options(value))").order("title"),
      (async () => {
        const out: PP[] = [];
        for (let from = 0; ; from += 1000) {
          const { data } = await sb.from("parasut_products").select("parasut_id, code, barcode, name, stock_count, archived, synced_at").range(from, from + 999);
          out.push(...(data || []));
          if (!data || data.length < 1000) break;
        }
        return out as (PP & { synced_at: string })[];
      })(),
    ]);
    const out: Row[] = [];
    for (const p of (prods as any[]) || []) {
      for (const v of sortByVariantValue((p.product_variants as any[]) || [], (x: any) => x.variant_options?.value ?? "")) {
        out.push({ id: v.id, title: p.title ?? "", value: v.variant_options?.value ?? "", sku: v.sku ?? "", barcode: v.barcode ?? "",
          active: p.is_active !== false && v.is_active !== false, pid: v.parasut_product_id ?? null });
      }
    }
    setRows(out);
    setPps(pp);
    setSynced(pp[0]?.synced_at ?? null);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const byId = useMemo(() => new Map(pps.map((p) => [p.parasut_id, p])), [pps]);
  const status = (r: Row) => {
    const p = r.pid ? byId.get(r.pid) : null;
    if (!p) return "none";
    return (r.sku && K(p.code) !== K(r.sku)) || (r.barcode && K(p.barcode) !== K(r.barcode)) ? "diff" : "ok";
  };
  const counts = useMemo(() => {
    const c = { none: 0, diff: 0, ok: 0 };
    for (const r of rows) c[status(r) as keyof typeof c]++;
    return c;
  }, [rows, byId]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => {
    const t = q.toLocaleLowerCase("tr").split(/\s+/).filter(Boolean);
    return rows.filter((r) => (filter === "all" || status(r) === filter)
      && t.every((x) => `${r.title} ${r.value} ${r.sku} ${r.barcode}`.toLocaleLowerCase("tr").includes(x)));
  }, [rows, q, filter, byId]); // eslint-disable-line react-hooks/exhaustive-deps
  const free = useMemo(() => {
    const used = new Set(rows.map((r) => r.pid).filter(Boolean));
    return pps.filter((p) => !p.archived && !used.has(p.parasut_id)).sort((a, b) => String(a.name).localeCompare(String(b.name), "tr"));
  }, [rows, pps]);

  async function sync() {
    setBusy("sync");
    try {
      const j = await api({ op: "sync_products" });
      await load();
      siteAlert({ title: "Paraşüt ürünleri çekildi", message: `${j.count} Paraşüt ürünü · eşleşen numara ${j.matched} · eşleşmeyen ${j.unmatched}${j.conflicts?.length ? `\nAynı kodlu birden fazla Paraşüt ürünü: ${j.conflicts.join(", ")}` : ""}`, tone: "success" });
    } catch (e: any) { siteAlert({ title: "Paraşüt", message: e?.message, tone: "danger" }); }
    finally { setBusy(null); }
  }

  async function link(r: Row, pid: string | null) {
    try { await api({ op: "link", variant_id: r.id, parasut_id: pid }); setRows((p) => p.map((x) => (x.id === r.id ? { ...x, pid } : x))); }
    catch (e: any) { siteAlert({ message: e?.message, tone: "danger" }); }
  }

  async function pushCodes() {
    const ids = [...sel].filter((id) => rows.find((r) => r.id === id)?.pid);
    if (!ids.length) return;
    if (!(await siteConfirm({ title: `${ids.length} Paraşüt ürünü güncellensin mi?`, message: "Seçili satırlarda Paraşüt ürününün kodu site SKU’su, barkodu site barkodu olur. Paraşüt’te kayıtlı değişir.", confirmText: "Paraşüt’e yaz" }))) return;
    setBusy("push");
    let updated = 0;
    const errors: string[] = [];
    try {
      for (let i = 0; i < ids.length; i += 60) {
        const j = await api({ op: "push_codes", variant_ids: ids.slice(i, i + 60) });
        updated += j.updated; errors.push(...(j.errors || []));
      }
    } catch (e: any) { errors.push(e?.message); }
    setSel(new Set());
    await load();
    setBusy(null);
    siteAlert({ title: "Paraşüt güncellendi", message: `${updated} ürün güncellendi.${errors.length ? `\nHata: ${errors.slice(0, 5).join(" · ")}` : ""}`, tone: errors.length ? "danger" : "success" });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/settings?tab=integrations" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:underline"><ArrowLeft size={12} /> Ayarlar › Entegrasyonlar</Link>
          <h1 className="text-2xl font-bold">Paraşüt ürün eşleştirme</h1>
          <p className="text-sm text-muted-foreground">Her numara Paraşüt’te bir ürün. Fatura kalemleri bu eşleşmeyle Paraşüt ürününe bağlanır.{synced ? ` Son çekim: ${new Date(synced).toLocaleString("tr-TR")}` : ""}</p>
        </div>
        <Button onClick={sync} disabled={!!busy} className="gap-1.5">{busy === "sync" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Paraşüt’ten çek ve eşleştir</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([["none", `Eşleşmeyen (${counts.none})`], ["diff", `Kodu / barkodu farklı (${counts.diff})`], ["ok", `Eşleşen (${counts.ok})`], ["all", `Tümü (${rows.length})`]] as const).map(([k, l]) => (
          <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => { setFilter(k); setSel(new Set()); }}>{l}</Button>
        ))}
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ürün, numara, SKU, barkod" className="h-8 pl-7 w-64" />
        </div>
        {sel.size > 0 && <Button size="sm" className="gap-1.5" disabled={!!busy} onClick={pushCodes}>{busy === "push" ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Paraşüt’ü siteyle aynı yap ({sel.size})</Button>}
      </div>

      {loading ? <Loader2 className="animate-spin" /> : (
        <div className="rounded-xl border bg-white overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500"><tr>
              <th className="px-2 py-2"><input type="checkbox" checked={shown.length > 0 && shown.every((r) => sel.has(r.id))} onChange={(e) => setSel(e.target.checked ? new Set(shown.filter((r) => r.pid).map((r) => r.id)) : new Set())} /></th>
              <th className="px-2 py-2">Ürün</th><th className="px-2 py-2">No</th><th className="px-2 py-2">SKU</th><th className="px-2 py-2">Barkod</th><th className="px-2 py-2">Paraşüt ürünü</th>
            </tr></thead>
            <tbody className="divide-y">
              {shown.slice(0, 500).map((r) => {
                const p = r.pid ? byId.get(r.pid) : null;
                const s = status(r);
                return (
                  <tr key={r.id} className={r.active ? "" : "opacity-60"}>
                    <td className="px-2 py-1">{r.pid && <input type="checkbox" checked={sel.has(r.id)} onChange={(e) => setSel((x) => { const n = new Set(x); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} />}</td>
                    <td className="px-2 py-1 font-medium max-w-[260px] truncate" title={r.title}>{r.title}</td>
                    <td className="px-2 py-1 font-bold text-blue-600">{r.value}</td>
                    <td className="px-2 py-1 font-mono">{r.sku}</td>
                    <td className="px-2 py-1 font-mono">{r.barcode}</td>
                    <td className="px-2 py-1">
                      {p ? (
                        <div className={s === "diff" ? "text-amber-700" : "text-emerald-700"}>
                          <span className="font-medium">{p.name}</span>
                          <span className="block font-mono text-[10px]">kod {p.code || "—"} · barkod {p.barcode || "—"}{p.stock_count != null ? ` · stok ${p.stock_count}` : ""}</span>
                          <button className="text-[10px] text-slate-400 hover:text-red-600" onClick={() => link(r, null)}>eşleşmeyi kaldır</button>
                        </div>
                      ) : (
                        <select className="h-7 rounded border px-1 bg-white max-w-[260px]" value="" onChange={(e) => e.target.value && link(r, e.target.value)}>
                          <option value="">— Paraşüt ürünü seç —</option>
                          {free.map((x) => <option key={x.parasut_id} value={x.parasut_id}>{x.name}{x.code ? ` (${x.code})` : ""}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length > 500 && <p className="p-2 text-center text-xs text-muted-foreground">İlk 500 satır — aramayla daralt.</p>}
          {!shown.length && <p className="p-4 text-center text-sm text-muted-foreground">{pps.length ? "Bu filtrede satır yok." : "Henüz Paraşüt ürünü çekilmedi — “Paraşüt’ten çek ve eşleştir”."}</p>}
        </div>
      )}
    </div>
  );
}
