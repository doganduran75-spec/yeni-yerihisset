"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// ESKİ SİTE ÜYELERİNİ İNCELE: WooCommerce'ten aktarılan, hiç sipariş vermemiş hesaplar.
// Bot / sahte kayıtlar şüphe puanıyla işaretlenir (yüksek şüpheliler ön-seçili gelir);
// admin gözden geçirip seçtiklerini siler. Silinenler geçiş günü aktarımında yeniden
// gelmez (legacy_import_blocklist). Sipariş vermiş hiçbir hesap bu listede yoktur.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { siteAlert, siteConfirm } from "@/components/ui/site-dialog";
import { ArrowLeft, Loader2, Search, ShieldAlert, Trash2 } from "lucide-react";

type Row = {
  id: string; email: string; name: string; phone: string | null; created_at: string; source: string;
  hasAddress: boolean; score: number; level: "high" | "medium" | "low"; reasons: string[];
};

const LEVEL: Record<Row["level"], { label: string; cls: string }> = {
  high: { label: "Yüksek", cls: "bg-red-100 text-red-700" },
  medium: { label: "Orta", cls: "bg-amber-100 text-amber-800" },
  low: { label: "Düşük", cls: "bg-emerald-100 text-emerald-700" },
};
const SOURCE: Record<string, string> = { woo_yerihisset: "YeriHisset", woo_attipas: "Attipas" };

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export default function LegacyMemberReviewPage() {
  const [data, setData] = useState<{ rows: Row[]; imported: number; blocked: number } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [level, setLevel] = useState<"all" | Row["level"]>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/legacy-members", { headers: await authHeaders(), cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { siteAlert({ title: "Liste alınamadı", message: j.error || "Hata", tone: "danger" }); return; }
    setData(j);
    setSel(new Set((j.rows as Row[]).filter((x) => x.level === "high").map((x) => x.id))); // yüksek şüpheliler ön-seçili
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const n = q.trim().toLocaleLowerCase("tr-TR");
    return (data?.rows ?? []).filter((r) =>
      (level === "all" || r.level === level) &&
      (!n || r.email.toLowerCase().includes(n) || r.name.toLocaleLowerCase("tr-TR").includes(n)));
  }, [data, level, q]);
  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0 };
    for (const r of data?.rows ?? []) c[r.level]++;
    return c;
  }, [data]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allVisibleSelected = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggleVisible = () => setSel((s) => {
    const n = new Set(s);
    if (allVisibleSelected) rows.forEach((r) => n.delete(r.id)); else rows.forEach((r) => n.add(r.id));
    return n;
  });

  async function remove() {
    const ids = [...sel];
    if (!ids.length) return;
    const ok = await siteConfirm({
      title: `${ids.length} hesap silinsin mi?`,
      message: "Seçilen hesaplar KALICI olarak silinir ve geçiş günündeki aktarımda yeniden getirilmez. Bu hesapların hiç siparişi yok; sunucu bunu silmeden önce yeniden kontrol eder.",
      confirmText: "Sil", tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const reasons = Object.fromEntries((data?.rows ?? []).filter((r) => sel.has(r.id)).map((r) => [r.id, r.reasons.filter((x) => !x.startsWith("✓")).join(", ")]));
      const r = await fetch("/api/admin/legacy-members", {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ ids, reasons }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Silinemedi");
      const skipped: { email: string; reason: string }[] = j.skipped ?? [];
      const byReason = new Map<string, number>();
      skipped.forEach((s) => byReason.set(s.reason, (byReason.get(s.reason) || 0) + 1));
      siteAlert({
        title: skipped.length ? "Kısmen tamamlandı" : "Silindi",
        message: `${j.deleted} hesap silindi.` + (skipped.length
          ? `\n${skipped.length} hesap atlandı:\n` + [...byReason.entries()].map(([r, n]) => `• ${n} hesap — ${r}`).join("\n")
          : ""),
        tone: skipped.length && !j.deleted ? "danger" : "success",
      });
      await load();
    } catch (e: any) {
      siteAlert({ title: "Hata", message: e.message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin/members" className="text-xs text-muted-foreground hover:underline flex items-center gap-1 mb-1"><ArrowLeft size={12} /> Üyeler</Link>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldAlert size={22} className="text-olive-600" /> Eski Site Üyelerini İncele</h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-3xl">
            Eski sitelerden aktarılan ve <b>hiç sipariş vermemiş</b> hesaplar. Bot kayıtları şüphe puanıyla işaretli;
            <b> yüksek şüpheliler seçili geliyor</b> — gerçek gibi görünenlerin işaretini kaldır, sonra sil.
            Silinenler canlıya geçişteki son aktarımda yeniden gelmez.
          </p>
        </div>
        <Button onClick={remove} disabled={busy || sel.size === 0} variant="destructive" className="gap-2">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Seçilenleri sil ({sel.size})
        </Button>
      </div>

      {!data ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
              {([["all", `Hepsi (${data.rows.length})`], ["high", `Yüksek (${counts.high})`], ["medium", `Orta (${counts.medium})`], ["low", `Düşük (${counts.low})`]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setLevel(k)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${level === k ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="E-posta / ad ara…" className="h-9 pl-8 w-60" />
            </div>
            <span className="text-muted-foreground text-xs">{data.imported} aktarılan hesap · {data.blocked} daha önce silinen</span>
          </div>

          <div className="rounded-xl border bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 w-8"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} aria-label="Görünenlerin hepsini seç" /></th>
                  <th className="px-3 py-2">Şüphe</th>
                  <th className="px-3 py-2">E-posta</th>
                  <th className="px-3 py-2">Ad soyad</th>
                  <th className="px-3 py-2">Neden</th>
                  <th className="px-3 py-2">Kaynak</th>
                  <th className="px-3 py-2">Kayıt</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">Kayıt yok.</td></tr>
                ) : rows.map((r) => (
                  <tr key={r.id} className={`hover:bg-slate-50/60 ${sel.has(r.id) ? "bg-red-50/40" : ""}`} onClick={() => toggle(r.id)}>
                    <td className="px-3 py-2"><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} onClick={(e) => e.stopPropagation()} /></td>
                    <td className="px-3 py-2"><span className={`text-[11px] font-bold px-2 py-0.5 rounded ${LEVEL[r.level].cls}`}>{LEVEL[r.level].label}</span></td>
                    <td className="px-3 py-2 font-mono text-xs break-all">{r.email}</td>
                    <td className="px-3 py-2">{r.name || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {r.reasons.map((x) => <span key={x} className={`inline-block mr-2 ${x.startsWith("✓") ? "text-emerald-700" : ""}`}>{x}</span>)}
                    </td>
                    <td className="px-3 py-2 text-xs">{SOURCE[r.source] ?? r.source}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("tr-TR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
