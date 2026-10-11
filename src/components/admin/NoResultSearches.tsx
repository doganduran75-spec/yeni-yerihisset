"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, Trash2, Inbox } from "lucide-react";

// SONUÇSUZ ARAMALAR — ziyaretçi aradı, ürün çıkmadı (talep sinyali). Her terim için:
//   * Sil: saçma / işe yaramaz → listeden düşer (aynı terim sonradan yeniden aranırsa geri gelir)
//   * Talebe ekle: işe yarar → "Talep & Geri Bildirim"e not olarak eklenir ve listeden düşer
// Veri: no_result_searches(p_days) — bot aramaları ve silinmiş terimler hariç (migration 20261106).
// Kullanıldığı yerler: Talep & Geri Bildirim sayfası, İstatistikler.
export type NoResultRow = { term: string; cnt: number; last_at: string };

export async function fetchNoResultSearches(days: number): Promise<NoResultRow[]> {
  const { data } = await (supabase as any).rpc("no_result_searches", { p_days: days });
  return ((data as any[]) || []).map((r) => ({ term: r.term, cnt: Number(r.cnt), last_at: r.last_at }));
}

export default function NoResultSearches({ days = 30, onChange }: { days?: number; onChange?: () => void }) {
  const [rows, setRows] = useState<NoResultRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => setRows(await fetchNoResultSearches(days)), [days]);
  useEffect(() => { load(); }, [load]);

  async function dismiss(r: NoResultRow, toFeedback: boolean) {
    setBusy(r.term); setErr(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (toFeedback) {
        const { error } = await (supabase as any).from("feedback").insert({
          message: `Sonuçsuz arama: "${r.term}" (${r.cnt} kez aranmış)`, source: "search", created_by: user?.id ?? null,
        });
        if (error) throw error;
      }
      const { error } = await (supabase as any).from("search_dismissals").upsert({
        term: r.term, dismissed_at: new Date().toISOString(), action: toFeedback ? "to_feedback" : "deleted", dismissed_by: user?.id ?? null,
      });
      if (error) throw error;
      setRows((prev) => (prev || []).filter((x) => x.term !== r.term));
      onChange?.();
    } catch (e: any) {
      setErr(e?.message || "İşlem yapılamadı");
    } finally { setBusy(null); }
  }

  if (!rows) return <div className="py-6 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;
  return (
    <div className="space-y-2">
      {err && <p className="text-sm text-red-700">{err}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Bakılacak sonuçsuz arama yok.</p>
      ) : (
        <div className="divide-y">
          {rows.map((r) => (
            <div key={r.term} className="flex items-center gap-3 py-2">
              <span className="flex-1 min-w-0 truncate text-sm font-medium text-slate-800">{r.term}</span>
              <span className="text-[11px] font-black text-amber-700 bg-amber-100 rounded-full px-2 py-0.5 shrink-0">{r.cnt} kez</span>
              <span className="text-[11px] text-slate-400 w-20 text-right shrink-0">{new Date(r.last_at).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })}</span>
              <button disabled={busy === r.term} onClick={() => dismiss(r, true)} title="Talep & Geri Bildirim'e ekle, listeden kaldır"
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:bg-blue-50 rounded-lg px-2 py-1 shrink-0 disabled:opacity-50">
                <Inbox size={13} /> Talebe ekle
              </button>
              <button disabled={busy === r.term} onClick={() => dismiss(r, false)} title="Saçma / gereksiz — listeden kaldır"
                className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg px-2 py-1 shrink-0 disabled:opacity-50">
                {busy === r.term ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Sil
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
