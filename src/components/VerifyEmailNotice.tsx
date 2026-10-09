"use client";

import { useEffect, useState } from "react";
import { MailWarning } from "lucide-react";
import { supabase } from "@/lib/supabase";

/* eslint-disable @typescript-eslint/no-explicit-any */

// E-postası doğrulanmamış üyeye uyarı + "Doğrulama e-postası gönder".
// Yalnız hesap durumu "unverified" iken görünür (my_member_status — migration 20261028000001).
// Kullanım: Hesabım, Fırsatlar, İş ortaklığı. `reason` ne için gerektiğini söyler.
export default function VerifyEmailNotice({ reason, onState, className = "" }: { reason?: string; onState?: (s: string) => void; className?: string }) {
  const [state, setState] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setEmail(session.user.email || "");
      const { data } = await (supabase as any).rpc("my_member_status");
      const s = data?.state ?? null;
      setState(s);
      if (s && onState) onState(s);
    })().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state !== "unverified") return null;

  async function resend() {
    setSending(true); setNote(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      });
      const d = await res.json().catch(() => ({}));
      setNote(res.ok ? `Doğrulama e-postası ${email} adresine gönderildi. Gelen kutunu (ve gereksiz klasörünü) kontrol et.` : d?.error || "Gönderilemedi, biraz sonra tekrar dene.");
    } finally { setSending(false); }
  }

  return (
    <div className={`rounded-2xl border border-amber-200 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${className}`}>
      <div className="flex items-start gap-3 flex-1">
        <MailWarning size={20} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-900 leading-relaxed">
          <b>E-posta adresin doğrulanmadı.</b>{" "}
          {reason || "Doğrulayınca hoş geldin kuponun, Fırsatlar ve iş ortaklığı açılır."}
          {note && <div className="mt-1 text-amber-800">{note}</div>}
        </div>
      </div>
      <button
        onClick={resend}
        disabled={sending}
        className="h-10 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold disabled:opacity-60 shrink-0"
      >
        {sending ? "Gönderiliyor…" : "Doğrulama e-postası gönder"}
      </button>
    </div>
  );
}
