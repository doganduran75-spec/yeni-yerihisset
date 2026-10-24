"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// E-POSTA DENEMESİ — canlıya geçmeden bütün e-postaları dene (kullanıcı isteği). Her e-posta gerçek bir siparişin
// verisiyle YALNIZ senin adresine gider (konu: "[DENEME → asıl alıcı]"). Müşteriye gitmez, kayıt yazılmaz.
// Sunucu: /api/admin/email-test
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send, CheckCircle2, XCircle } from "lucide-react";

type Kind = { kind: string; group: string; label: string; order?: boolean };

async function api(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch("/api/admin/email-test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

export default function EmailTestPage() {
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [to, setTo] = useState("");
  const [order, setOrder] = useState("");
  const [res, setRes] = useState<Record<string, { ok: boolean; text: string } | "busy">>({});
  const [all, setAll] = useState(false);

  useEffect(() => { api({ list: true }).then((r) => { setKinds(r.json.kinds || []); setTo(r.json.to || ""); }); }, []);

  async function send(k: Kind) {
    setRes((p) => ({ ...p, [k.kind]: "busy" }));
    const r = await api({ kind: k.kind, order: order.trim() || undefined });
    const ok = r.status === 200 && r.json.ok;
    setRes((p) => ({ ...p, [k.kind]: { ok, text: ok ? `Gönderildi${r.json.order ? ` (${r.json.order})` : ""}` : (r.json.error || r.json.status || `HTTP ${r.status}`) } }));
  }
  async function sendAll() {
    setAll(true);
    for (const k of kinds) await send(k);
    setAll(false);
  }

  const groups = [...new Set(kinds.map((k) => k.group))];
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">E-posta denemesi</h1>
        <p className="text-sm text-muted-foreground">
          Her e-posta gerçek bir siparişin verisiyle <b>yalnız {to || "senin adresine"}</b> gider; konu “[DENEME → asıl alıcı]” ile başlar.
          Müşteriye gitmez, siparişe ya da bildirim kaydına bir şey yazılmaz. Metinleri canlıya almadan önce buradan birlikte gözden geçiririz.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hangi sipariş?</CardTitle>
          <CardDescription>Sipariş no (ör. YH24127) ya da pazaryeri no. Boş bırakırsan son site siparişi kullanılır. Fatura e-postası için faturası kesilmiş bir sipariş seç.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Input className="w-48" value={order} onChange={(e) => setOrder(e.target.value)} placeholder="YH…" />
          <Button onClick={sendAll} disabled={all || !kinds.length} className="gap-1.5">
            {all ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Hepsini gönder ({kinds.length})
          </Button>
          <span className="text-xs text-muted-foreground">Gelen kutunda (ve spam klasöründe) kontrol et.</span>
        </CardContent>
      </Card>
      {groups.map((g) => (
        <Card key={g}>
          <CardHeader><CardTitle className="text-base">{g}</CardTitle></CardHeader>
          <CardContent className="divide-y">
            {kinds.filter((k) => k.group === g).map((k) => {
              const r = res[k.kind];
              return (
                <div key={k.kind} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="flex-1 min-w-0 text-sm">{k.label}{k.order && <span className="text-[11px] text-muted-foreground"> · sipariş verisiyle</span>}</span>
                  {r && r !== "busy" && (
                    <span className={`flex items-center gap-1 text-xs ${r.ok ? "text-green-700" : "text-red-700"}`}>
                      {r.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {r.text}
                    </span>
                  )}
                  <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={r === "busy" || all} onClick={() => send(k)}>
                    {r === "busy" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Bana gönder
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
