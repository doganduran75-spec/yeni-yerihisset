"use client";

import { useEffect, useState } from "react";
import { Mail, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Hesabım › İletişim tercihleri: kampanya e-postası izni (ticari ileti).
// Değişiklik sunucuda kaydedilir ve ispat için kayıt düşer (/api/marketing-consent).
// Sipariş, kargo, şifre e-postaları bu tercihten bağımsız her zaman gelir.
export default function MarketingConsentToggle() {
  const [granted, setGranted] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data } = await (supabase as any).from("profiles").select("marketing_consent").eq("id", session.user.id).maybeSingle();
      setGranted(!!data?.marketing_consent);
    }).catch(() => {});
  }, []);

  async function toggle(value: boolean) {
    setSaving(true); setNote(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/marketing-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ granted: value }),
      });
      if (res.ok) { setGranted(value); setNote(value ? "Kaydedildi — kampanyalardan haberdar olacaksın." : "Kaydedildi — kampanya e-postası gönderilmeyecek."); }
      else setNote("Kaydedilemedi, tekrar dener misin?");
    } finally { setSaving(false); }
  }

  if (granted === null) return null;
  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
      <h4 className="font-black text-slate-800 uppercase tracking-tight text-sm flex items-center gap-2"><Mail size={16} className="text-olive-600" /> İletişim tercihleri</h4>
      <label className="mt-3 flex items-start gap-3 cursor-pointer select-none">
        <input type="checkbox" checked={granted} disabled={saving} onChange={(e) => toggle(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-olive-600" />
        <span className="text-sm text-slate-700 leading-relaxed">
          Kampanya, indirim ve yeni ürün e-postaları almak istiyorum.
          <span className="block text-xs text-slate-500 mt-0.5">Sipariş ve kargo bilgilendirmeleri bu tercihten bağımsız olarak gelir.</span>
        </span>
        {saving && <Loader2 size={16} className="animate-spin text-slate-400 mt-0.5" />}
      </label>
      {note && <p className="text-xs text-olive-700 mt-2">{note}</p>}
    </div>
  );
}
