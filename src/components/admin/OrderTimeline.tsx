"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Truck, AlertTriangle, RefreshCw, PackageCheck, Undo2, PencilLine,
  FileText, CheckCircle2, Banknote, StickyNote, Loader2, Clock, Plus,
} from "lucide-react";

type OrderEvent = {
  id: string;
  type: string;
  note: string | null;
  tracking_code: string | null;
  created_at: string;
};

const TYPES: { key: string; label: string; icon: any; color: string; tracking?: boolean }[] = [
  { key: "shipped",         label: "Kargolandı",          icon: Truck,        color: "text-blue-600",   tracking: true },
  { key: "tracking_wrong",  label: "Kargo no hatalı",     icon: AlertTriangle,color: "text-amber-600" },
  { key: "exchange",        label: "Değişim yapılacak",   icon: RefreshCw,    color: "text-purple-600" },
  { key: "reshipped",       label: "Yeni kargo gönderildi",icon: Truck,       color: "text-blue-600",   tracking: true },
  { key: "return_expected", label: "İade bekleniyor",     icon: Undo2,        color: "text-orange-600" },
  { key: "return_received", label: "İade geldi",          icon: PackageCheck, color: "text-teal-600" },
  { key: "corrected",       label: "Sipariş düzeltildi",  icon: PencilLine,   color: "text-slate-600" },
  { key: "refund",          label: "Ücret iadesi yapıldı",icon: Banknote,     color: "text-green-700" },
  { key: "invoiced",        label: "Fatura kesildi",      icon: FileText,     color: "text-indigo-600" },
  { key: "closed",          label: "Süreç kapatıldı",     icon: CheckCircle2, color: "text-green-600" },
  { key: "note",            label: "Not",                 icon: StickyNote,   color: "text-slate-500" },
];
const TYPE_MAP = Object.fromEntries(TYPES.map((t) => [t.key, t]));

export default function OrderTimeline({
  orderId,
  onOrderChanged,
}: {
  orderId: string;
  onOrderChanged?: (patch: Record<string, any>) => void;
}) {
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("shipped");
  const [tracking, setTracking] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("order_events")
      .select("id, type, note, tracking_code, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });
    setEvents((data as OrderEvent[]) || []);
    setLoading(false);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  async function addEvent() {
    setSaving(true);
    try {
      const t = TYPE_MAP[type];
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("order_events").insert({
        order_id: orderId,
        type,
        note: note.trim() || null,
        tracking_code: t?.tracking ? (tracking.trim() || null) : null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;

      // ── Türüne göre sipariş alanlarını güncelle ──
      const patch: Record<string, any> = {};
      if (type === "shipped" || type === "reshipped") patch.shipment_status = "shipped";
      if (type === "invoiced") patch.invoice_status = "invoiced";
      if (type === "return_received") patch.shipment_status = "returned";
      if (type === "refund" && note.trim()) patch.refund_method = note.trim();
      if (type === "closed") { patch.is_closed = true; patch.closed_at = new Date().toISOString(); }
      if (Object.keys(patch).length > 0) {
        await (supabase as any).from("orders").update(patch).eq("id", orderId);
        onOrderChanged?.(patch);
      }

      setNote(""); setTracking("");
      load();
    } catch (e: any) {
      alert("Eklenemedi: " + (e?.message ?? "hata"));
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent(id: string) {
    if (!confirm("Bu kayıt silinsin mi?")) return;
    await (supabase as any).from("order_events").delete().eq("id", id);
    load();
  }

  const showTracking = !!TYPE_MAP[type]?.tracking;

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-bold flex items-center gap-2 text-slate-700">
        <Clock size={15} /> Süreç Takibi
      </h4>

      {/* Ekleme formu */}
      <div className="rounded-xl border border-slate-200 p-3 space-y-2 bg-slate-50/60">
        <div className="flex gap-2 flex-wrap">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="flex-1 min-w-[160px] h-9 rounded-lg border border-input bg-white px-2 text-sm"
          >
            {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          {showTracking && (
            <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Kargo takip no" className="h-9 w-40" />
          )}
        </div>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={type === "refund" ? "İade yöntemi (ör. iyzico iade / havale iban)" : "Açıklama (opsiyonel)"}
          className="h-9"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={addEvent} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Kaydı Ekle
          </Button>
        </div>
      </div>

      {/* Zaman çizelgesi */}
      {loading ? (
        <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-slate-400" /></div>
      ) : events.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-3">Henüz kayıt yok. Süreç adımlarını buraya ekleyin.</p>
      ) : (
        <ol className="relative border-l-2 border-slate-100 ml-2 space-y-3">
          {events.map((ev) => {
            const t = TYPE_MAP[ev.type];
            const Icon = t?.icon ?? StickyNote;
            return (
              <li key={ev.id} className="ml-4 group">
                <span className={`absolute -left-[9px] flex items-center justify-center w-4 h-4 rounded-full bg-white ring-2 ring-slate-100 ${t?.color ?? "text-slate-400"}`}>
                  <Icon size={11} />
                </span>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className={`text-xs font-bold ${t?.color ?? "text-slate-600"}`}>{t?.label ?? ev.type}</p>
                    {ev.tracking_code && <p className="text-[11px] font-mono text-slate-500">Takip: {ev.tracking_code}</p>}
                    {ev.note && <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-wrap">{ev.note}</p>}
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {new Date(ev.created_at).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <button onClick={() => removeEvent(ev.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition text-[10px]">Sil</button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
