"use client";

// "Fırsatlar sitede açık" / "Bilgi Bankası sitede açık" kutusu (kullanıcı 2026-11-15). Kapalıyken menülerde yok,
// sayfa doğrudan adresle açılır (Google'a kapalı). Kural: src/lib/section-flags.ts · uç: /api/admin/section-flags.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { resetSectionFlags } from "@/lib/section-flags-client";

export default function SectionToggle({ field, label }: { field: "opportunities_enabled" | "kb_enabled"; label: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void Promise.resolve((supabase as any).from("settings").select(field).order("id", { ascending: true }).limit(1).maybeSingle()) // eslint-disable-line @typescript-eslint/no-explicit-any
      .then(({ data, error }: any) => setOn(error ? null : data?.[field] !== false)); // eslint-disable-line @typescript-eslint/no-explicit-any
  }, [field]);

  async function change(v: boolean) {
    setBusy(true); setErr(null);
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch("/api/admin/section-flags", {
      method: "POST", headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify({ field, value: v }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error || "Kaydedilemedi"); return; }
    setOn(v); resetSectionFlags();
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm rounded-xl border bg-white px-3 py-2 cursor-pointer" title="Kapalıyken menülerde görünmez; sayfa doğrudan adresle açılır, Google'a kapalıdır">
      {busy ? <Loader2 size={14} className="animate-spin" /> : <input type="checkbox" checked={!!on} disabled={on === null} onChange={(e) => change(e.target.checked)} />}
      <span className="font-medium">{label}</span>
      <span className={on ? "text-xs font-bold text-green-700" : "text-xs font-bold text-slate-400"}>{on === null ? "…" : on ? "açık" : "kapalı"}</span>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </label>
  );
}
