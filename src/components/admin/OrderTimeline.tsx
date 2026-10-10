"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Truck, AlertTriangle, RefreshCw, PackageCheck, Undo2, PencilLine,
  FileText, CheckCircle2, Banknote, StickyNote, Loader2, Plus,
} from "lucide-react";

// SİPARİŞ NOTLARI (eski "Süreç Takibi"). Akış kararı (2026-10-10): durum değişiklikleri yalnız
// "Sıradaki adım" panelinden yapılır — burada yalnız NOT eklenir. Sistemin yazdığı olaylar
// (ödeme, kargo, iade, iptal…) soluk ve salt okunur görünür; eski kayıt türleri de okunur kalır.
type OrderEvent = {
  id: string;
  type: string;
  note: string | null;
  tracking_code: string | null;
  created_at: string;
  created_by: string | null;
};

const TYPES: { key: string; label: string; icon: any; color: string }[] = [
  { key: "shipped",         label: "Kargolandı",            icon: Truck,         color: "text-blue-600" },
  { key: "tracking_wrong",  label: "Kargo no hatalı",       icon: AlertTriangle, color: "text-amber-600" },
  { key: "exchange",        label: "Değişim",               icon: RefreshCw,     color: "text-purple-600" },
  { key: "reshipped",       label: "Yeni kargo gönderildi", icon: Truck,         color: "text-blue-600" },
  { key: "return_expected", label: "İade bekleniyor",       icon: Undo2,         color: "text-orange-600" },
  { key: "return_received", label: "İade geldi",            icon: PackageCheck,  color: "text-teal-600" },
  { key: "corrected",       label: "Sipariş düzeltildi",    icon: PencilLine,    color: "text-slate-600" },
  { key: "refund",          label: "Ücret iadesi",          icon: Banknote,      color: "text-green-700" },
  { key: "invoiced",        label: "Fatura kesildi",        icon: FileText,      color: "text-indigo-600" },
  { key: "closed",          label: "Süreç kapatıldı",       icon: CheckCircle2,  color: "text-green-600" },
  { key: "note",            label: "Not",                   icon: StickyNote,    color: "text-slate-600" },
];
const TYPE_MAP = Object.fromEntries(TYPES.map((t) => [t.key, t]));

export default function OrderTimeline({ orderId }: { orderId: string; onOrderChanged?: (patch: Record<string, any>) => void }) {
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("order_events")
      .select("id, type, note, tracking_code, created_at, created_by")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });
    setEvents((data as OrderEvent[]) || []);
    setLoading(false);
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  async function addNote() {
    if (!note.trim()) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("order_events").insert({
        order_id: orderId, type: "note", note: note.trim(), created_by: user?.id ?? null,
      });
      if (error) throw error;
      setNote("");
      load();
    } catch (e: any) {
      alert("Eklenemedi: " + (e?.message ?? "hata"));
    } finally {
      setSaving(false);
    }
  }

  async function removeNote(id: string) {
    if (!confirm("Bu not silinsin mi?")) return;
    await (supabase as any).from("order_events").delete().eq("id", id);
    load();
  }

  // Elle yazılmış not = tür "note" + yazan kişi belli. Diğerleri sistem kaydı (salt okunur).
  const isManual = (ev: OrderEvent) => ev.type === "note" && !!ev.created_by;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-bold flex items-center gap-2 text-slate-700">
        <StickyNote size={15} /> Notlar
      </h4>

      <div className="rounded-xl border border-slate-200 p-3 space-y-2 bg-slate-50/60">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Bu siparişle ilgili not (müşteriyle konuşma, kargo bilgisi, değişim isteği…)"
          className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm resize-y"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={addNote} disabled={saving || !note.trim()} className="gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Not ekle
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-slate-400" /></div>
      ) : events.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-2">Henüz not yok.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((ev) => {
            const t = TYPE_MAP[ev.type];
            const Icon = t?.icon ?? StickyNote;
            const manual = isManual(ev);
            return (
              <li key={ev.id} className={`group flex items-start gap-2 ${manual ? "" : "opacity-60"}`}>
                <Icon size={13} className={`mt-0.5 shrink-0 ${manual ? "text-slate-600" : t?.color ?? "text-slate-400"}`} />
                <div className="flex-1 min-w-0">
                  {!manual && <p className={`text-[11px] font-bold ${t?.color ?? "text-slate-500"}`}>{t?.label ?? ev.type} <span className="font-normal text-slate-400">· sistem</span></p>}
                  {ev.tracking_code && <p className="text-[11px] font-mono text-slate-500">Takip: {ev.tracking_code}</p>}
                  {ev.note && <p className={`whitespace-pre-wrap ${manual ? "text-sm text-slate-800" : "text-xs text-slate-600"}`}>{ev.note}</p>}
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {new Date(ev.created_at).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {manual && (
                  <button onClick={() => removeNote(ev.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition text-[10px]">Sil</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
