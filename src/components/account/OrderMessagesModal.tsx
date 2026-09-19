"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { X, Send, Loader2, MessageSquare } from "lucide-react";

// Sipariş-özel sohbet. Mobilde tam ekran sheet, masaüstünde ortada dialog.
export default function OrderMessagesModal({
  orderId, orderLabel, userId, onClose, onRead, initialDraft,
}: {
  orderId: string;
  orderLabel: string; // "YH1234"
  userId: string;
  onClose: () => void;
  onRead?: () => void; // rozet güncellensin diye
  initialDraft?: string; // ör. iade/değişim talebi ön-metni
}) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState(initialDraft ?? "");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("messages").select("*").eq("order_id", orderId).order("created_at", { ascending: true });
      setMessages((data as any[]) || []);
      setLoading(false);
      // Admin mesajlarını okundu işaretle
      await (supabase as any).from("messages")
        .update({ is_read: true }).eq("order_id", orderId).eq("sender_role", "admin").eq("is_read", false);
      onRead?.();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    const { data, error } = await (supabase as any).from("messages").insert({
      user_id: userId, order_id: orderId, content, sender_role: "user",
    }).select().single();
    if (!error && data) {
      setMessages((m) => [...m, data]); setText("");
      // Admin'e e-posta bildirimi (kritik değil)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          fetch("/api/messages/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ orderId, senderRole: "user" }),
          }).catch(() => {});
        }
      } catch { /* yut */ }
    }
    setSending(false);
  }

  return (
    <div className="fixed inset-0 z-[100] flex md:items-center md:justify-center bg-black/40 md:p-4" onClick={onClose}>
      <div
        className="w-full h-full md:h-[85vh] md:max-w-lg md:rounded-3xl bg-white flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom md:zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Başlık */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-olive-50 text-olive-600 flex items-center justify-center">
              <MessageSquare size={18} />
            </div>
            <div>
              <p className="font-black text-slate-900 leading-none">Mesajlar</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Sipariş {orderLabel}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Kapat" className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-50">
            <X size={20} />
          </button>
        </div>

        {/* Mesajlar */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">
          {loading ? (
            <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-olive-600" /></div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6">
              <MessageSquare className="text-slate-300" size={32} />
              <p className="text-sm text-slate-400">Bu siparişle ilgili sorunu buradan iletebilirsin. En kısa sürede dönüş yaparız.</p>
            </div>
          ) : (
            messages.map((m) => {
              const mine = m.sender_role === "user";
              return (
                <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                  <div className={[
                    "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                    mine ? "bg-olive-600 text-white rounded-br-md" : "bg-white border border-slate-100 text-slate-700 rounded-bl-md",
                  ].join(" ")}>
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    <p className={["text-[10px] mt-1", mine ? "text-white/60" : "text-slate-400"].join(" ")}>
                      {new Date(m.created_at).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Yazma kutusu */}
        <form onSubmit={send} className="flex items-center gap-2 p-3 border-t border-slate-100 shrink-0" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Mesajını yaz…"
            className="flex-1 h-11 rounded-2xl border border-slate-200 px-4 text-sm outline-none focus:border-olive-400"
          />
          <button
            type="submit" disabled={sending || !text.trim()}
            className="w-11 h-11 rounded-2xl bg-olive-600 hover:bg-olive-700 text-white flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all shrink-0"
            aria-label="Gönder"
          >
            {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </form>
      </div>
    </div>
  );
}
