"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, Mail, MessageSquare, Inbox } from "lucide-react";

type Feedback = {
  id: string;
  email: string | null;
  message: string;
  source: string | null;
  is_handled: boolean;
  created_at: string;
};

export default function FeedbackPage() {
  const [rows, setRows] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await (supabase as any).from("feedback").select("*").order("created_at", { ascending: false });
    setRows((data as Feedback[]) || []);
    setLoading(false);
  }

  async function toggleHandled(f: Feedback) {
    setBusy(f.id);
    try {
      await (supabase as any).from("feedback").update({ is_handled: !f.is_handled }).eq("id", f.id);
      setRows((prev) => prev.map((x) => x.id === f.id ? { ...x, is_handled: !x.is_handled } : x));
    } finally { setBusy(null); }
  }

  const shown = rows.filter((r) => (filter === "open" ? !r.is_handled : true));
  const openCount = rows.filter((r) => !r.is_handled).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Talep & Geri Bildirim</h2>
        <p className="text-muted-foreground">Müşterilerin &quot;aradığını bulamadım&quot; notları — ne üreteceğine/stoklayacağına karar için.</p>
      </div>

      <div className="flex gap-2">
        {([["open", `Bekleyen (${openCount})`], ["all", `Hepsi (${rows.length})`]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${filter === k ? "bg-olive-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <Card className="shadow-sm border-muted">
        <CardHeader className="pb-3">
          <CardTitle>Notlar</CardTitle>
          <CardDescription>E-posta bırakanlara stok gelince dönebilirsin.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
          ) : shown.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground border border-dashed rounded-xl">
              <Inbox size={32} className="mx-auto mb-3 text-slate-300" />
              <p className="font-medium">Bu sekmede kayıt yok.</p>
            </div>
          ) : (
            <div className="divide-y">
              {shown.map((f) => (
                <div key={f.id} className="py-3 flex items-start gap-3">
                  <MessageSquare size={16} className="text-slate-300 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{f.message}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      {f.email ? (
                        <a href={`mailto:${f.email}`} className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline">
                          <Mail size={11} /> {f.email}
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">e-posta yok</span>
                      )}
                      <span className="text-[11px] text-slate-400">
                        {new Date(f.created_at).toLocaleString("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {f.is_handled && <Badge className="text-[10px] bg-green-100 text-green-700 border-none hover:bg-green-100">İşlendi</Badge>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={f.is_handled ? "outline" : "default"}
                    disabled={busy === f.id}
                    onClick={() => toggleHandled(f)}
                    className="h-8 shrink-0 gap-1.5"
                  >
                    {busy === f.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    {f.is_handled ? "Geri Al" : "İşlendi"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
