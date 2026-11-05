"use client";

// PARAŞÜT BAĞLANTI DÖNÜŞÜ — yeni altyapı (id.parasut.com, Authorization Code + PKCE; src/lib/parasut.ts).
// Panelde "Paraşüt ile bağlan" → Paraşüt girişi + onay → buraya ?code=…&state=… ile döner → sunucu kodu
// (state ve PKCE doğrulanarak) oturuma çevirir → Ayarlar › Entegrasyonlar. DevHub'daki dönüş adresi bu sayfa.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export default function ParasutCallbackPage() {
  const [st, setSt] = useState<{ kind: "busy" | "ok" | "err"; msg: string }>({ kind: "busy", msg: "Paraşüt bağlantısı kuruluyor…" });
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return; // kod tek kullanımlık — geliştirme modunda çift çalışmasın
    once.current = true;
    const q = new URLSearchParams(window.location.search);
    const code = q.get("code"), state = q.get("state"), error = q.get("error");
    // Kod adres çubuğunda / geçmişte kalmasın
    window.history.replaceState(null, "", window.location.pathname);
    (async () => {
      if (error || !code || !state) {
        setSt({ kind: "err", msg: error === "access_denied" ? "Paraşüt'te izin verilmedi." : `Paraşüt bağlantısı kurulamadı${q.get("error_description") ? `: ${q.get("error_description")}` : error ? ` (${error})` : " (kod gelmedi)"}.` });
        return;
      }
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const r = await fetch("/api/admin/parasut", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
          body: JSON.stringify({ op: "connect_oidc", code, state }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "Paraşüt hatası");
        setSt({ kind: "ok", msg: `Paraşüt bağlandı (yeni altyapı)${j.userEmail ? ` — ${j.userEmail}` : ""}.` });
      } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        setSt({ kind: "err", msg: e?.message || "Paraşüt bağlantısı kurulamadı." });
      }
    })();
  }, []);

  return (
    <div className="max-w-lg mx-auto mt-16 rounded-2xl border bg-white p-6 space-y-4 text-center">
      {st.kind === "busy" && <Loader2 className="mx-auto animate-spin text-slate-400" size={28} />}
      {st.kind === "ok" && <CheckCircle2 className="mx-auto text-green-600" size={28} />}
      {st.kind === "err" && <AlertCircle className="mx-auto text-red-600" size={28} />}
      <p className={`text-sm font-medium ${st.kind === "err" ? "text-red-700" : "text-slate-800"}`}>{st.msg}</p>
      {st.kind !== "busy" && (
        <Link href="/admin/settings?tab=integrations" className="inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          Entegrasyonlara dön
        </Link>
      )}
    </div>
  );
}
