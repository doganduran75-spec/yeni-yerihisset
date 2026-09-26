"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// İade / Değişim KISA TALEP FORMU. Talep, siparişin mesajlarına düzenli bir
// metin olarak düşer (iade görüşmeli yürür) ve admin'e e-posta bildirimi gider.
// İlk satırdaki işaret (RETURN_MARK) sayesinde Hesabım'da "Talebin alındı"
// durumuna geçilir — form ikinci kez açılmaz.
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { X, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export const RETURN_MARK = /^(📦 İADE TALEBİ|🔄 DEĞİŞİM TALEBİ)/;

const REASONS = [
  "Numara uymadı",
  "Ürün kusurlu / hasarlı geldi",
  "Yanlış ürün gönderildi",
  "Beğenmedim / vazgeçtim",
  "Diğer",
];

export default function ReturnRequestModal({ order, orderLabel, userId, onClose, onSent }: {
  order: any; orderLabel: string; userId: string; onClose: () => void; onSent: () => void;
}) {
  const items: any[] = (order.order_items || []).filter((i: any) => Number(i.unit_price) > 0 || !i.is_gift);
  const [kind, setKind] = useState<"iade" | "degisim">("iade");
  const [picked, setPicked] = useState<Set<string>>(new Set(items.length === 1 ? [items[0].id] : []));
  const [reason, setReason] = useState("");
  const [wanted, setWanted] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const title = (i: any) => i.products?.title || i.title || "Ürün";

  async function submit() {
    setErr(null);
    if (picked.size === 0) { setErr("En az bir ürün seç."); return; }
    if (!reason) { setErr("Bir sebep seç."); return; }
    if (kind === "degisim" && !wanted.trim()) { setErr("Değişimde istediğin numarayı / seçeneği yaz."); return; }

    const lines = [
      `${kind === "iade" ? "📦 İADE TALEBİ" : "🔄 DEĞİŞİM TALEBİ"} — Sipariş ${orderLabel}`,
      "Ürün(ler):",
      ...items.filter((i) => picked.has(i.id)).map((i) => `• ${title(i)}${i.variant_name ? ` (${i.variant_name})` : ""} × ${i.quantity}`),
      `Sebep: ${reason}`,
      ...(kind === "degisim" ? [`İstenen numara / seçenek: ${wanted.trim()}`] : []),
      ...(note.trim() ? [`Not: ${note.trim()}`] : []),
    ];

    setSending(true);
    const { error } = await (supabase as any).from("messages").insert({
      user_id: userId, order_id: order.id, content: lines.join("\n"), sender_role: "user",
    });
    if (error) { setSending(false); setErr("Talep gönderilemedi, lütfen tekrar dene."); return; }
    // Admin'e e-posta bildirimi (kritik değil)
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        fetch("/api/messages/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ orderId: order.id, senderRole: "user" }),
        }).catch(() => {});
      }
    } catch { /* yut */ }
    setSending(false);
    onSent();
  }

  const pill = (active: boolean) => cn(
    "flex-1 h-11 rounded-xl border-2 text-sm font-black transition-colors",
    active ? "border-olive-600 bg-olive-50 text-olive-700" : "border-slate-200 text-slate-500 hover:border-slate-300"
  );

  return (
    <div className="fixed inset-0 z-[100] flex md:items-center md:justify-center bg-black/40 md:p-4" onClick={onClose}>
      <div
        className="w-full h-full md:h-auto md:max-h-[90vh] md:max-w-lg md:rounded-3xl bg-white flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <RotateCcw size={18} className="text-olive-600" />
            <div>
              <p className="font-black text-slate-900">İade / Değişim Talebi</p>
              <p className="text-xs text-slate-400">Sipariş {orderLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Kapat"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Talebin</p>
            <div className="flex gap-2">
              <button type="button" className={pill(kind === "iade")} onClick={() => setKind("iade")}>İade</button>
              <button type="button" className={pill(kind === "degisim")} onClick={() => setKind("degisim")}>Değişim</button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Hangi ürün(ler)?</p>
            <div className="space-y-2">
              {items.map((i) => (
                <label key={i.id} className={cn("flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 cursor-pointer", picked.has(i.id) ? "border-olive-600 bg-olive-50/40" : "border-slate-100")}>
                  <input type="checkbox" checked={picked.has(i.id)} onChange={() => toggle(i.id)} className="accent-olive-600 w-4 h-4" />
                  <span className="text-sm font-bold text-slate-800 flex-1">{title(i)}{i.variant_name ? <span className="text-olive-600"> · {i.variant_name}</span> : null}</span>
                  <span className="text-xs text-slate-400">× {i.quantity}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Sebep</p>
            <select value={reason} onChange={(e) => setReason(e.target.value)}
              className="w-full h-11 rounded-xl border-2 border-slate-200 bg-white px-3 text-sm font-bold focus:outline-none focus:border-olive-600">
              <option value="">Seç…</option>
              {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {kind === "degisim" && (
            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">İstediğin numara / seçenek</p>
              <input value={wanted} onChange={(e) => setWanted(e.target.value)} placeholder="Örn: 42 numara"
                className="w-full h-11 rounded-xl border-2 border-slate-200 px-3 text-sm font-bold focus:outline-none focus:border-olive-600" />
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Not (isteğe bağlı)</p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000}
              placeholder="Eklemek istediğin bir şey varsa yaz."
              className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-olive-600" />
          </div>

          <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 rounded-xl p-3">
            Talebin siparişinin mesajlarına iletilir; ekibimiz kargo ve süreç için seninle buradan iletişime geçer.
          </p>
          {err && <p className="text-sm font-bold text-red-600">{err}</p>}
        </div>

        <div className="px-5 py-4 border-t flex gap-2">
          <button onClick={onClose} className="h-12 px-5 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold text-sm">Vazgeç</button>
          <button onClick={submit} disabled={sending}
            className="flex-1 h-12 rounded-2xl bg-olive-600 hover:bg-olive-700 text-white font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {sending ? <Loader2 size={16} className="animate-spin" /> : null} Talebi Gönder
          </button>
        </div>
      </div>
    </div>
  );
}
