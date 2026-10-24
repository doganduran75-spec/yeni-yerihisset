"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Siparişte "Kargoya ver (Kargonomi)" penceresi — akış src/lib/kargonomi-flow.ts:
//   desi → "Teklifleri getir" → firma seç → "Bu firmayla gönder" → kod bekleniyor (pencere açıkken 30 sn'de bir,
//   kapalıyken sunucu dakikada bir sorgular) → kod gelince siparişe yazılır (etiket → "Paket hazır" → kurye alınca "Kurye aldı" → Kargoda + e-posta).
import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { siteConfirm } from "@/components/ui/site-dialog";
import { supabase } from "@/lib/supabase";
import { orderLabel } from "@/lib/order-label";
import { Truck, Loader2, AlertCircle, CheckCircle, Copy, RefreshCw, Send } from "lucide-react";

type Offer = { id: string; name: string; price: string | null; amount: number | null };

async function call(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch("/api/kargonomi/ship", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Kargonomi hatası");
  return j;
}

export default function KargonomiDialog({ order, onClose, onChanged }: {
  order: any | null;
  onClose: () => void;
  onChanged: (row: any) => void;
}) {
  const [o, setO] = useState<any | null>(order);
  const [desi, setDesi] = useState("2");
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Pencere açılınca siparişin güncel Kargonomi alanlarını oku
  const reload = useCallback(async (id: string) => {
    const { data } = await supabase.from("orders").select("*").eq("id", id).single();
    if (data) { setO(data); onChanged(data); }
    return data as any;
  }, [onChanged]);

  useEffect(() => {
    if (!order) return;
    let off = false;
    supabase.from("orders").select("*").eq("id", order.id).single().then(({ data }) => {
      if (off) return;
      const d: any = data ?? order;
      setO(d);
      setDesi(d.kargonomi_desi ? String(d.kargonomi_desi) : "2");
      setPick("");
      setErr(null);
    });
    return () => { off = true; };
  }, [order]);

  const waiting = !!(o?.kargonomi_confirmed_at && !o?.kargonomi_tracking_code && !o?.kargonomi_error);

  // Kod beklerken pencere açıksa 30 sn'de bir sorgula (sunucu ayrıca dakikada bir sorgular)
  useEffect(() => {
    if (!o?.id || !waiting) return;
    const t = setInterval(() => { call({ op: "check", order_id: o.id }).then(() => reload(o.id)).catch(() => {}); }, 30_000);
    return () => clearInterval(t);
  }, [o?.id, waiting, reload]);

  async function run(kind: string, body: Record<string, unknown>) {
    if (!o) return;
    setBusy(kind); setErr(null);
    try { await call({ ...body, order_id: o.id }); }
    catch (e: any) { setErr(e?.message || "Hata"); }
    finally { await reload(o.id); setBusy(null); }
  }

  const offers: Offer[] = (o?.kargonomi_offers as Offer[]) || [];
  const sorted = [...offers].sort((a, b) => (a.id === "-1" ? -1 : b.id === "-1" ? 1 : (a.amount ?? 1e9) - (b.amount ?? 1e9)));
  let addr: Record<string, string> = {};
  try { addr = typeof o?.shipping_address === "string" ? JSON.parse(o.shipping_address) : o?.shipping_address ?? {}; } catch { /* boş */ }

  return (
    <Dialog open={!!order} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Truck size={18} className="text-purple-600" /> Kargoya ver (Kargonomi)</DialogTitle>
          <DialogDescription>Sipariş {o ? orderLabel(o) : ""}</DialogDescription>
        </DialogHeader>

        {o && (
          <div className="space-y-4 py-1 text-sm">
            <div className="bg-slate-50 border rounded-lg p-3 text-xs text-muted-foreground space-y-0.5">
              <p className="font-semibold text-slate-700">{addr.name}</p>
              <p>{addr.address}</p>
              <p>{addr.district && `${addr.district}, `}{addr.city} · {addr.phone}</p>
            </div>

            {o.kargonomi_tracking_code ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-3">
                  <CheckCircle size={20} className="text-green-600 shrink-0" />
                  <p className="text-sm font-semibold text-green-800">Kargo kodu geldi — etiketi bas, paketi hazırla, “Paket hazır” de.</p>
                </div>
                <div className="flex items-center justify-between bg-slate-50 border rounded-lg p-3">
                  <span><span className="text-xs text-muted-foreground">{o.kargonomi_provider || o.cargo_provider || "Kargo"} kodu</span>
                    <code className="block font-mono font-bold">{o.kargonomi_tracking_code}</code></span>
                  <button onClick={() => navigator.clipboard.writeText(o.kargonomi_tracking_code)} className="text-blue-500 text-xs flex items-center gap-1"><Copy size={12} /> Kopyala</button>
                </div>
              </div>
            ) : o.kargonomi_confirmed_at ? (
              <div className="space-y-3">
                {o.kargonomi_error ? (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-red-700">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" /> {o.kargonomi_error}
                  </div>
                ) : (
                  <div className="flex items-start gap-3 bg-purple-50 border border-purple-200 rounded-lg p-3 text-purple-900">
                    <Loader2 size={18} className="animate-spin shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Kargo kodu bekleniyor{o.kargonomi_provider ? ` — ${o.kargonomi_provider}` : ""}</p>
                      <p className="text-xs mt-0.5">Firmaya göre birkaç saniye – 10+ dakika sürer. Pencereyi kapatabilirsin: kod gelince siparişe yazılır; sonra etiketi basıp “Paket hazır” dersin.</p>
                      <p className="text-[11px] text-purple-700 mt-1">Durum: {o.kargonomi_status || "—"}{o.kargonomi_checked_at ? ` · son sorgu ${new Date(o.kargonomi_checked_at).toLocaleTimeString("tr-TR")}` : ""}</p>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 gap-1.5" disabled={!!busy} onClick={() => run("check", { op: "check" })}>
                    {busy === "check" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Şimdi sorgula
                  </Button>
                  <Button variant="outline" className="flex-1 text-red-600" disabled={!!busy} onClick={async () => {
                    if (await siteConfirm({ title: "Gönderi iptal edilsin mi?", message: "Kargonomi'ye iptal talebi gider (kargoya verilmemişse). Sonra yeniden teklif alabilirsin.", confirmText: "İptal et", tone: "danger" })) run("cancel", { op: "cancel" });
                  }}>{busy === "cancel" ? <Loader2 size={14} className="animate-spin" /> : null} İptal et</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-end gap-2">
                  <label className="flex-1 space-y-1">
                    <span className="text-xs font-medium">Desi</span>
                    <Input type="number" min="0.5" max="300" step="0.5" value={desi} onChange={(e) => setDesi(e.target.value)} />
                  </label>
                  <Button className="gap-1.5" disabled={!!busy || !(Number(desi) > 0)} onClick={() => run("quote", { op: "quote", desi: Number(desi) })}>
                    {busy === "quote" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {offers.length ? "Teklifleri yenile" : "Teklifleri getir"}
                  </Button>
                </div>

                {sorted.length > 0 && (
                  <div className="rounded-lg border divide-y">
                    {sorted.map((f) => {
                      const off = f.id !== "-1" && f.amount == null;
                      return (
                        <label key={f.id} className={`flex items-center gap-2 px-3 py-2 ${off ? "opacity-50" : "cursor-pointer hover:bg-slate-50"}`}>
                          <input type="radio" name="kargo" disabled={off} checked={pick === f.id} onChange={() => setPick(f.id)} />
                          <span className="flex-1 font-medium">{f.id === "-1" ? "Otomatik (en ucuz firma)" : f.name}</span>
                          <span className="text-xs text-slate-600">{f.id === "-1" ? "" : f.price ?? "—"}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-2">
                  {o.kargonomi_shipment_id && (
                    <Button variant="outline" disabled={!!busy} onClick={() => run("cancel", { op: "cancel" })}>Vazgeç</Button>
                  )}
                  <Button className="flex-1 gap-1.5 bg-purple-600 hover:bg-purple-700" disabled={!!busy || !pick}
                    onClick={() => run("confirm", { op: "confirm", provider_id: pick })}>
                    {busy === "confirm" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Bu firmayla gönder
                  </Button>
                </div>
              </div>
            )}

            {err && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-red-700">
                <AlertCircle size={16} className="shrink-0 mt-0.5" /> {err}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
