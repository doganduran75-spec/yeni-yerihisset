"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";

// "Deneme e-postası gönder" — kayıtlı SMTP ayarlarıyla yönetici adresine (İletişim Bilgileri › E-posta) gerçek
// bir e-posta yollar. Kullanıldığı yerler: Ayarlar › SMTP kartı, Sistem › E-posta. Uç: /api/admin/system-status
export default function TestMailButton({ note }: { note?: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function send() {
    setBusy(true); setMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/admin/system-status", {
        method: "POST", headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ action: "test_mail" }),
      });
      const j = await r.json();
      setMsg(r.ok ? { ok: true, text: `Gönderildi → ${j.to}. Gelen kutunu (ve spam klasörünü) kontrol et.` } : { ok: false, text: j.error || `HTTP ${r.status}` });
    } catch (e: any) { setMsg({ ok: false, text: e?.message || "Gönderilemedi" }); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={send} className="gap-1.5">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Deneme e-postası gönder
        </Button>
        {msg && <span className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</span>}
      </div>
      <p className="text-xs text-muted-foreground">{note ?? "“Gönderildi” yalnız e-posta sunucusunun kabul ettiğini gösterir; asıl kanıt deneme e-postasının gelen kutuna düşmesidir."}</p>
    </div>
  );
}
