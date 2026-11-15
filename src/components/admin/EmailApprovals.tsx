"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// E-POSTA ONAYI (kullanıcı 2026-11-15): müşteriye ilk kez gidecek e-posta türleri burada bekler.
// "Gönder" → e-posta gider + tür onaylanır (aynı türde bekleyenler de gider); sonraki aynı tür e-postalar doğrudan gider.
// Veri: /api/admin/email-approvals. Kural: src/lib/mail-guard.ts.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Loader2, Send, X, Eye, EyeOff, CheckCircle2, Undo2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { siteConfirm } from "@/components/ui/site-dialog";

async function call(method: "GET" | "POST", body?: any, qs = "") {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`/api/admin/email-approvals${qs}`, {
    method, cache: "no-store",
    headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
const when = (s?: string) => (s ? new Date(s).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export default function EmailApprovals() {
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => { const r = await call("GET"); setD(r.json); }, []);
  useEffect(() => { void load(); }, [load]);

  async function show(id: string) {
    if (open === id) { setOpen(null); setPreview(null); return; }
    setOpen(id); setPreview(null);
    const r = await call("GET", undefined, `?id=${encodeURIComponent(id)}`);
    setPreview(r.json);
  }
  async function act(op: string, extra: any, key: string) {
    setBusy(key); setNote(null);
    const r = await call("POST", { op, ...extra });
    setBusy(null);
    if (r.json?.error) setNote(r.json.error);
    else if (op === "send") setNote(r.json.sent > 1 ? `Gönderildi (aynı türden ${r.json.sent - 1} e-posta daha). Bu tür artık onaysız gider.` : "Gönderildi. Bu tür artık onaysız gider.");
    setOpen(null); setPreview(null);
    void load();
  }

  if (!d) return <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-blue-600" /></div>;
  const pending: any[] = d.pending || [];

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">E-posta onayı</h2>
        <p className="text-sm text-muted-foreground">Bir e-posta türü müşteriye ilk kez gönderilirken burada bekler. Okuyup “Gönder”e basınca gider ve o tür onaylanır; sonrakiler doğrudan gider.</p>
      </div>
      {d.locked && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">E-posta kilidi açık: müşteri e-postaları şu an hiç gönderilmiyor. Kilit kapatılınca (canlı) onay gereken e-postalar buraya düşer.</p>}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!d.enabled} disabled={!!busy} onChange={(e) => act("enabled", { value: e.target.checked }, "enabled")} />
        Onaylanmamış türleri gönderimden önce onayıma sun
      </label>
      {note && <p className="text-sm font-medium text-slate-700">{note}</p>}

      <section className="space-y-2">
        <h3 className="font-bold">Onay bekleyen ({pending.length})</h3>
        {pending.length === 0 && <p className="text-sm text-muted-foreground italic">Onay bekleyen e-posta yok.</p>}
        {pending.map((r) => (
          <div key={r.id} className="rounded-xl border bg-white p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <b className="text-sm">{r.label}</b>
              <span className="text-xs text-muted-foreground">→ {r.recipient} · {when(r.created_at)}</span>
            </div>
            <p className="text-sm text-slate-700">{r.subject}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => show(r.id)}>{open === r.id ? <EyeOff size={14} /> : <Eye size={14} />} {open === r.id ? "Kapat" : "E-postayı gör"}</Button>
              <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700" disabled={!!busy} onClick={() => act("send", { id: r.id }, r.id)}>
                {busy === r.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Gönder ve türü onayla
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-red-600" disabled={!!busy}
                onClick={async () => { if (await siteConfirm({ title: "Gönderilmesin mi?", message: "Bu e-posta müşteriye gitmez. Tür onaylanmaz; aynı türün bir sonraki e-postası yine onayına gelir.", confirmText: "Gönderme", tone: "danger" })) act("discard", { id: r.id }, r.id); }}>
                <X size={14} /> Gönderme
              </Button>
              {r.editable && <Link href={`/admin/crm/email-templates/${r.kind}`} className="text-xs text-blue-600 hover:underline self-center">Şablonu düzenle (sonraki e-postalara yansır)</Link>}
            </div>
            {open === r.id && (preview ? (
              <div className="space-y-1">
                {preview.attachments?.length > 0 && <p className="text-xs text-slate-600 flex items-center gap-1"><Paperclip size={12} /> Ek: {preview.attachments.join(", ")}</p>}
                <iframe title="E-posta önizleme" sandbox="" srcDoc={preview.html || "<p>İçerik yok</p>"} className="w-full h-[560px] rounded-lg border bg-white" />
              </div>
            ) : <Loader2 className="animate-spin text-blue-600" />)}
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">Onaylanmış türler ({(d.approved || []).length})</h3>
        {(d.approved || []).length === 0 && <p className="text-sm text-muted-foreground italic">Henüz onaylanan tür yok.</p>}
        <div className="rounded-xl border divide-y bg-white">
          {(d.approved || []).map((k: any) => (
            <div key={k.kind} className="flex items-center gap-2 px-3 py-2 text-sm">
              <CheckCircle2 size={15} className="text-green-600 shrink-0" />
              <span className="flex-1">{k.label} <span className="text-xs text-muted-foreground">· {when(k.approved_at)}</span></span>
              <button className="text-xs text-slate-500 hover:text-red-600 inline-flex items-center gap-1" disabled={!!busy} onClick={() => act("unapprove", { kind: k.kind }, k.kind)}>
                <Undo2 size={12} /> Onayı geri al
              </button>
            </div>
          ))}
        </div>
      </section>

      {(d.recent || []).length > 0 && (
        <section className="space-y-2">
          <h3 className="font-bold text-sm text-slate-600">Son kararlar</h3>
          <div className="rounded-xl border divide-y bg-white text-xs">
            {(d.recent || []).map((r: any) => (
              <div key={r.id} className="px-3 py-1.5 flex flex-wrap gap-2">
                <span className={r.status === "sent" ? "text-green-700 font-bold" : r.status === "failed" ? "text-red-600 font-bold" : "text-slate-500 font-bold"}>
                  {r.status === "sent" ? "Gönderildi" : r.status === "failed" ? "Gönderilemedi" : "Gönderilmedi"}
                </span>
                <span>{r.label} → {r.recipient}</span>
                <span className="text-muted-foreground">{when(r.decided_at)}</span>
                {r.error && <span className="text-red-600">{r.error}</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
