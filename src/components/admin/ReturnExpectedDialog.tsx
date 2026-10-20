"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// "İADE GELECEK" (kullanıcı isteği 2026-10-20): müşteri iadeyi telefonla / mesajla bildirdi → yönetici iade talebi
// açar. Müşteriye e-posta GİTMEZ. "Müşteri kendisi gönderiyor" → doğrudan "iade yolda" (4 gün gelmezse bekleyen işler);
// "Kargo kodu göndereceğim" → "iade talebi" (sonra İade kodunu gönder). Ürün gelince her zamanki "İade geldi".
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const REASONS = ["Numara küçük", "Numara büyük", "Kalıp uymadı", "Beğenmedi", "Kusurlu ürün", "Diğer"];

export default function ReturnExpectedDialog({ order, onClose, onSubmit }: {
  order: any | null;
  onClose: () => void;
  onSubmit: (payload: { items: string[]; mode: "self" | "code"; reason: string; iban: string }) => Promise<boolean>;
}) {
  const items = ((order?.order_items as any[]) || []).filter((i) => Number(i.returned_qty || 0) < Number(i.quantity));
  const [sel, setSel] = useState<string[]>([]);
  const [mode, setMode] = useState<"self" | "code">("self");
  const [reason, setReason] = useState("");
  const [iban, setIban] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!order) return;
    setSel(items.length === 1 ? [items[0].id] : []); setMode("self"); setReason(""); setIban(""); // eslint-disable-line react-hooks/set-state-in-effect
  }, [order?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const havale = order?.payment_method === "bank_transfer";
  return (
    <Dialog open={!!order} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>İade gelecek</DialogTitle>
          <DialogDescription>Müşteri iade edeceğini bildirdi. Talep açılır, müşteriye e-posta gitmez. Ürün gelince “İade geldi” ile stoğa ekleyip ücreti iade edersin.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <p className="font-semibold">Hangi ürün?</p>
            {items.length === 0 ? <p className="text-slate-500">İade edilebilecek ürün yok.</p> : items.map((i) => (
              <label key={i.id} className="flex items-center gap-2">
                <input type="checkbox" checked={sel.includes(i.id)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, i.id] : s.filter((x) => x !== i.id)))} />
                <span>{i.products?.title || i.title || "Ürün"}{i.variant_name ? ` — ${i.variant_name}` : ""}{Number(i.quantity) > 1 ? ` (${i.quantity} adet)` : ""}</span>
              </label>
            ))}
          </div>
          <div className="space-y-1.5">
            <p className="font-semibold">Ürün nasıl gelecek?</p>
            <label className="flex items-start gap-2"><input type="radio" checked={mode === "self"} onChange={() => setMode("self")} className="mt-1" />
              <span><b>Müşteri kendisi gönderiyor</b> — kod gerekmiyor, sipariş “İade yolda” olur ({4} gün içinde gelmezse bekleyen işlere düşer)</span></label>
            <label className="flex items-start gap-2"><input type="radio" checked={mode === "code"} onChange={() => setMode("code")} className="mt-1" />
              <span><b>Kargo kodu göndereceğim</b> — sipariş “İade talebi” olur, sonra “İade kodunu gönder”</span></label>
          </div>
          <div className="space-y-1.5">
            <p className="font-semibold">Sebep <span className="font-normal text-slate-400">(isteğe bağlı)</span></p>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 w-full rounded-md border px-2 bg-white">
              <option value="">—</option>
              {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {havale && (
            <div className="space-y-1.5">
              <p className="font-semibold">Müşterinin IBAN’ı <span className="font-normal text-slate-400">(havale ödemesi — ücret iadesi için; biliyorsan)</span></p>
              <Input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="TR.." />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button disabled={!sel.length || busy} onClick={async () => { setBusy(true); const ok = await onSubmit({ items: sel, mode, reason, iban: iban.trim() }); setBusy(false); if (ok) onClose(); }}>
            İade talebini aç
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
