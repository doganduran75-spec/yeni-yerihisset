"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// e-Arşiv faturası kargo firması ister (ad + VKN). Kargo entegrasyonu çalışmadığında ya da sipariş başka yolla
// (elle / başka firma) gönderildiğinde siparişte firma olmaz → fatura takılırdı. Bu pencere Ayarlar › Paraşüt ›
// Kargo firmaları listesinden (VKN'si girilmiş olanlar) seçtirir; seçim siparişin kargo firması olarak kaydedilir.
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

export default function CarrierPickDialog({ open, orderLabel, onPick, onClose }: {
  open: boolean;
  orderLabel?: string;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<{ name: string; vkn: string | null }[] | null>(null);
  const [sel, setSel] = useState("");
  useEffect(() => {
    if (!open) return;
    (supabase as any).from("cargo_carriers").select("name, vkn").order("name")
      .then(({ data }: any) => setList((data as any[]) || []));
  }, [open]);
  const ready = (list || []).filter((c) => c.vkn);
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Kargo firmasını seç</DialogTitle>
          <DialogDescription>
            {orderLabel ? `${orderLabel}: ` : ""}e-Arşiv faturası gönderimi yapan kargo firmasını ister. Siparişte firma yok
            (entegrasyon dışı ya da başka yolla gönderilmiş). Seçtiğin firma siparişe kaydedilir ve fatura kesilir.
          </DialogDescription>
        </DialogHeader>
        {list === null ? (
          <p className="text-sm text-slate-500 py-4">Yükleniyor…</p>
        ) : ready.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            VKN'si girilmiş kargo firması yok. Ayarlar › Entegrasyonlar › Paraşüt › Kargo firmaları'ndan ekle.
          </p>
        ) : (
          <div className="grid gap-2 max-h-72 overflow-y-auto">
            {ready.map((c) => (
              <label key={c.name} className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer ${sel === c.name ? "border-olive-600 bg-olive-50" : "border-slate-200"}`}>
                <input type="radio" name="carrier" checked={sel === c.name} onChange={() => setSel(c.name)} />
                <span className="font-semibold text-sm">{c.name}</span>
                <span className="ml-auto text-xs text-slate-400 font-mono">VKN {c.vkn}</span>
              </label>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button disabled={!sel} onClick={() => onPick(sel)}>Kaydet ve faturayı kes</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
