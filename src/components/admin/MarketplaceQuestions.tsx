"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// MESAJLAR › TRENDYOL SORULARI (kullanıcı 2026-11-14): pazaryerindeki ürün soruları tek noktada; cevap buradan Trendyol'a.
// Sorular 5 dk'da bir çekilir (src/lib/marketplace/trendyol-qna.ts); "Şimdi yenile" ile hemen. Eşleşen üründe numara stoğu.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, RefreshCw, Send, ExternalLink, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { siteConfirm } from "@/components/ui/site-dialog";
import { answerProblems, QNA_STATUS_LABEL, ANSWER_MAX } from "@/lib/marketplace/qna-rules";

const STATUS_TONE: Record<string, string> = {
  WAITING_FOR_ANSWER: "bg-amber-100 text-amber-800", WAITING_FOR_APPROVE: "bg-blue-50 text-blue-700", ANSWERED: "bg-green-50 text-green-700",
  REJECTED: "bg-red-50 text-red-700", REPORTED: "bg-slate-100 text-slate-600", UNANSWERED: "bg-slate-100 text-slate-500",
};

async function api(body: any) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch("/api/admin/marketplace-questions", {
    method: "POST", headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

export default function MarketplaceQuestions() {
  const [rows, setRows] = useState<any[]>([]);
  const [stock, setStock] = useState<Record<string, { size: string; stock: number }[]>>({});
  const [filter, setFilter] = useState<"waiting" | "all">("waiting");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = (supabase as any).from("marketplace_questions").select("*").order("asked_at", { ascending: false }).limit(200);
    if (filter === "waiting") q = q.eq("status", "WAITING_FOR_ANSWER");
    const { data } = await q;
    const list = (data as any[]) || [];
    setRows(list);
    const pids = [...new Set(list.map((r) => r.product_id).filter(Boolean))];
    if (pids.length) {
      const { data: vs } = await (supabase as any).from("product_variants").select("product_id, stock, is_active, variant_options(value)").in("product_id", pids);
      const m: Record<string, { size: string; stock: number }[]> = {};
      for (const v of (vs as any[]) || []) {
        if (v.is_active === false) continue;
        (m[v.product_id] ??= []).push({ size: String(v.variant_options?.value ?? "—"), stock: Number(v.stock || 0) });
      }
      for (const k of Object.keys(m)) m[k].sort((a, b) => parseFloat(a.size.replace(",", ".")) - parseFloat(b.size.replace(",", ".")));
      setStock(m);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  async function sync() {
    setSyncing(true); setNote(null);
    const r = await api({ op: "sync" });
    setSyncing(false);
    setNote(r.json?.error ? `Trendyol: ${r.json.error}` : `${r.json?.added ?? 0} yeni soru, ${r.json?.updated ?? 0} güncelleme`);
    void load();
  }

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div className="flex flex-wrap items-center gap-2">
        {(["waiting", "all"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cn("h-9 px-3 rounded-xl text-sm font-bold border", filter === f ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600")}>
            {f === "waiting" ? "Cevap bekleyen" : "Tümü"}
          </button>
        ))}
        <Button variant="outline" size="sm" onClick={sync} disabled={syncing} className="gap-1.5 ml-auto">
          {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Şimdi yenile
        </Button>
      </div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {loading ? <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /></div>
          : rows.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground italic">{filter === "waiting" ? "Cevap bekleyen Trendyol sorusu yok." : "Henüz soru yok."}</p>
          : rows.map((r) => <QuestionCard key={r.id} r={r} sizes={r.product_id ? stock[r.product_id] : undefined} onDone={load} />)}
      </div>
      <p className="text-[11px] text-muted-foreground">Sorular 5 dakikada bir Trendyol'dan çekilir. Cevap Trendyol'un incelemesinden sonra yayınlanır; telefon, e-posta, bağlantı ya da pazaryeri dışına yönlendirme içeren cevaplar reddedilir.</p>
    </div>
  );
}

function QuestionCard({ r, sizes, onDone }: { r: any; sizes?: { size: string; stock: number }[]; onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const live = answerProblems(text);
  const canAnswer = r.status === "WAITING_FOR_ANSWER";

  async function send(force = false) {
    setBusy(true); setErr(null);
    const res = await api({ op: "answer", id: r.id, text, force });
    setBusy(false);
    if (res.status === 409 && res.json?.warnings?.length) {
      if (await siteConfirm({ title: "Cevap reddedilebilir", message: `${res.json.warnings.join(" ")} Yine de gönderilsin mi?`, confirmText: "Yine de gönder", tone: "danger" })) return send(true);
      return;
    }
    if (!res.json?.ok) { setErr(res.json?.error || "Gönderilemedi"); return; }
    setText(""); onDone();
  }

  return (
    <div className="rounded-2xl border bg-white p-4 space-y-3">
      <div className="flex gap-3">
        {r.image_url ? <img src={r.image_url} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0 bg-slate-100" /> : <div className="w-14 h-14 rounded-xl bg-slate-100 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("text-[10px] font-bold rounded-full px-2 py-0.5", STATUS_TONE[r.status] ?? "bg-slate-100")}>{QNA_STATUS_LABEL[r.status] ?? r.status}</span>
            <span className="text-[11px] text-muted-foreground">{r.asked_at ? new Date(r.asked_at).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}{r.user_name ? ` · ${r.user_name}` : ""}</span>
          </div>
          <p className="text-sm font-semibold text-slate-800 truncate mt-0.5">
            {r.product_name || "Ürün"}
            {r.product_url && <a href={r.product_url} target="_blank" rel="noopener noreferrer" className="inline-flex ml-1 text-slate-400 hover:text-slate-700 align-middle"><ExternalLink size={13} /></a>}
          </p>
          {sizes && sizes.length > 0 && (
            <p className="text-[11px] text-slate-500 mt-0.5">Stok: {sizes.map((s) => <span key={s.size} className={cn("mr-1.5", s.stock > 0 ? "text-green-700 font-semibold" : "text-slate-400")}>{s.size}:{s.stock}</span>)}</p>
          )}
          {!r.product_id && <p className="text-[11px] text-slate-400 mt-0.5">Sitedeki ürünle eşleşmedi (model kodu: {r.product_main_id || "—"})</p>}
        </div>
      </div>
      <p className="text-sm text-slate-900 whitespace-pre-wrap bg-slate-50 rounded-xl px-3 py-2">{r.question}</p>
      {r.answer && <p className="text-sm text-slate-700 whitespace-pre-wrap border-l-2 border-green-400 pl-3"><b className="text-xs text-green-700">Cevap:</b> {r.answer}</p>}
      {(r.reject_reason || r.error) && (
        <p className="text-xs font-semibold text-red-700 flex gap-1.5"><AlertTriangle size={14} className="shrink-0 mt-0.5" /> {r.reject_reason || r.error}</p>
      )}
      {canAnswer && (
        <div className="space-y-1.5">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={ANSWER_MAX} placeholder="Cevabınızı yazın (en az 10 karakter)…"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          {text && live.warnings.length > 0 && <p className="text-[11px] text-amber-700">{live.warnings.join(" ")}</p>}
          {err && <p className="text-xs font-semibold text-red-600">{err}</p>}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">{text.trim().length} / {ANSWER_MAX}</span>
            <Button size="sm" onClick={() => send(false)} disabled={busy || live.errors.length > 0} className="gap-1.5">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Trendyol'a gönder
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
