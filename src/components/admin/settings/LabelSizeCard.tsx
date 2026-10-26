"use client";

// Ayarlar › Kargo: kargo etiketi kâğıt boyutu (şimdilik A5 yazıcı kâğıdı; etiket yazıcısına geçince 10×15).
// settings.label_size tarayıcıya kapalı kolon → okuma / yazma sunucuda (/api/admin/orders/labels).
import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { siteAlert } from "@/components/ui/site-dialog";

const OPTIONS = [
  { value: "a5", label: "A5 kâğıt", hint: "148 × 210 mm — normal yazıcı" },
  { value: "100x150", label: "10 × 15 cm etiket", hint: "termal etiket yazıcısı" },
];

async function call(body: object) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch("/api/admin/orders/labels", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d as { size: string; hbDesi?: number };
}

export default function LabelSizeCard() {
  const [size, setSize] = useState<string | null>(null);
  const [desi, setDesi] = useState("");
  const [desiMsg, setDesiMsg] = useState("");
  useEffect(() => { call({ getSize: true }).then((d) => { setSize(d.size); setDesi(String(d.hbDesi ?? 2)); }).catch(() => setSize("a5")); }, []);
  async function saveDesi() {
    setDesiMsg("");
    try { const d = await call({ hbDesi: Number(desi) }); setDesi(String(d.hbDesi)); setDesiMsg("Kaydedildi"); }
    catch (e) { setDesiMsg((e as Error).message); }
  }
  async function pick(v: string) {
    const old = size;
    setSize(v);
    try { await call({ size: v }); } catch (e) {
      setSize(old);
      siteAlert({ title: "Kaydedilemedi", message: (e as Error).message, tone: "danger" });
    }
  }
  return (
    <div className="mb-6 rounded-xl border border-muted bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-2 font-semibold"><Printer size={18} className="text-blue-600" /> Kargo etiketi boyutu</div>
      <p className="text-xs text-muted-foreground">Sipariş ekranındaki “Etiket yazdır” bu boyutta basar (site, Trendyol, Hepsiburada aynı etiket).</p>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((o) => (
          <button key={o.value} type="button" disabled={size === null} onClick={() => pick(o.value)}
            className={`rounded-lg border-2 px-3 py-2 text-left text-sm ${size === o.value ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
            <b className="block">{o.label}</b><span className="text-[11px] text-muted-foreground">{o.hint}</span>
          </button>
        ))}
      </div>
      {/* Hepsiburada paketleme ("Paket hazır" → API ile paketlenir; kargo ücreti desiye göre) */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
        <span className="text-sm font-semibold">Hepsiburada paket desisi</span>
        <input value={desi} onChange={(e) => setDesi(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="h-8 w-16 rounded-md border px-2 text-sm" />
        <button type="button" onClick={saveDesi} className="h-8 rounded-md border px-3 text-xs font-bold hover:bg-slate-50">Kaydet</button>
        {desiMsg && <span className="text-xs text-muted-foreground">{desiMsg}</span>}
        <p className="w-full text-[11px] text-muted-foreground">“Paket hazır” dediğinde Hepsiburada siparişi bu desiyle tek koli olarak paketlenir; kargo ücreti buna göre hesaplanır.</p>
      </div>
    </div>
  );
}
