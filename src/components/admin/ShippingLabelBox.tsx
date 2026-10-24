"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Sipariş detayında kargo etiketi: "Etiket yazdır" (her seferinde güncel kargo kodundan), kod değiştiyse uyarı.
// Kargo kodu yoksa etiket basılmaz. Site siparişi kargo entegrasyonu dışında gönderiliyorsa (Kargonomi yok / başka
// firma) firma + takip kodu burada elle girilir — etiket ve müşteri kargo bilgisi bu koddan çalışır.
import { useEffect, useState } from "react";
import { Printer, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { siteAlert } from "@/components/ui/site-dialog";
import { printShippingLabels, labelOutdated } from "@/lib/shipping-label";

type O = {
  id: string; channel?: string | null; status?: string | null;
  cargo_provider?: string | null; cargo_tracking_number?: string | null; kargonomi_tracking_code?: string | null;
  label_printed_code?: string | null; label_printed_at?: string | null;
};

export default function ShippingLabelBox({ order, onChange }: { order: O; onChange: (fields: Record<string, any>) => void }) {
  const code = order.cargo_tracking_number || order.kargonomi_tracking_code || "";
  const isSite = !order.channel || order.channel === "site";
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const [carriers, setCarriers] = useState<string[]>([]);
  const [carrier, setCarrier] = useState(order.cargo_provider || "");
  const [track, setTrack] = useState(order.cargo_tracking_number || "");
  useEffect(() => { setCarrier(order.cargo_provider || ""); setTrack(order.cargo_tracking_number || ""); setEdit(false); }, [order.id, order.cargo_provider, order.cargo_tracking_number]);
  useEffect(() => {
    if (!edit || carriers.length) return;
    (supabase as any).from("cargo_carriers").select("name").order("name").then(({ data }: any) => setCarriers(((data as any[]) || []).map((c) => c.name)));
  }, [edit, carriers.length]);

  if (order.status === "cancelled") return null;

  async function print() {
    setBusy(true);
    const r = await printShippingLabels([order.id]);
    setBusy(false);
    if (r.error) return siteAlert({ title: "Etiket yazdırılamadı", message: r.error, tone: "danger" });
    if (r.printed) onChange({ label_printed_code: code, label_printed_at: new Date().toISOString() });
    else if (r.skipped.length) siteAlert({ message: `Etiket basılmadı: ${r.skipped[0].reason}.`, tone: "danger" });
  }

  async function saveManual() {
    const t = track.trim().replace(/\s+/g, "");
    if (!carrier.trim() || !t) return siteAlert({ message: "Kargo firması ve takip kodu gerekli.", tone: "danger" });
    setBusy(true);
    const fields = { cargo_provider: carrier.trim(), cargo_tracking_number: t };
    const { error } = await (supabase as any).from("orders").update(fields).eq("id", order.id);
    setBusy(false);
    if (error) return siteAlert({ title: "Kaydedilemedi", message: error.message, tone: "danger" });
    onChange(fields);
    setEdit(false);
  }

  const outdated = labelOutdated(order);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Printer size={15} className="text-slate-500" />
        <b>Kargo etiketi</b>
        {code
          ? <span className="text-xs text-slate-600">{order.cargo_provider || "Kargo"} · <span className="font-mono">{code}</span></span>
          : <span className="text-xs text-amber-700">Kargo kodu yok — etiket basılamaz{isSite ? " (Kargonomi'den al ya da elle gir)" : " (pazaryerinden kod gelince basılır)"}</span>}
        {order.label_printed_at && !outdated && (
          <span className="text-[11px] text-slate-400">· yazdırıldı {new Date(order.label_printed_at).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}</span>
        )}
        <span className="ml-auto flex gap-2">
          {isSite && !edit && (
            <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEdit(true)}>
              {order.cargo_tracking_number ? "Kodu değiştir" : "Kodu elle gir"}
            </Button>
          )}
          <Button type="button" size="sm" variant={outdated ? "default" : "outline"} className="h-8 gap-1.5 text-xs" disabled={!code || busy} onClick={print}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />} {order.label_printed_at ? "Yeniden yazdır" : "Etiket yazdır"}
          </Button>
        </span>
      </div>
      {outdated && (
        <p className="flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
          <AlertTriangle size={13} /> Kargo kodu değişti — etiketi yeniden yazdır (eski etiketteki kod: <span className="font-mono">{order.label_printed_code}</span>)
        </p>
      )}
      {edit && (
        <div className="flex flex-wrap items-center gap-2">
          <input list="label-carriers" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Kargo firması"
            className="h-8 rounded-md border border-slate-200 px-2 text-xs w-40 bg-white" />
          <datalist id="label-carriers">{carriers.map((c) => <option key={c} value={c} />)}</datalist>
          <Input value={track} onChange={(e) => setTrack(e.target.value)} placeholder="Takip kodu" className="h-8 text-xs font-mono w-48" />
          <Button type="button" size="sm" className="h-8 text-xs" disabled={busy} onClick={saveManual}>Kaydet</Button>
          <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEdit(false)}>Vazgeç</Button>
        </div>
      )}
    </div>
  );
}
