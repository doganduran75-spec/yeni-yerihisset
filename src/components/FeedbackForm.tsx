"use client";

import { useState } from "react";
import { Search, Send, CheckCircle2, Loader2 } from "lucide-react";

/**
 * "Aradığını bulamadın mı?" — e-posta + not bırak, gönder. Admin ekranında görünür.
 * /products altında; karşılanmayan talebi yakalar.
 */
export default function FeedbackForm({ source = "products" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!message.trim()) { setError("Lütfen ne aradığını yaz."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, message, source }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "Gönderilemedi.");
      setDone(true);
    } catch (err: any) {
      setError(err?.message || "Gönderilemedi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-20 rounded-[2rem] border border-slate-100 bg-olive-50/40 p-8 md:p-10">
      {done ? (
        <div className="flex flex-col items-center text-center gap-3 py-6">
          <CheckCircle2 className="text-olive-600" size={40} />
          <h3 className="text-xl font-black text-slate-900">Teşekkürler! 🌱</h3>
          <p className="text-sm text-slate-500 max-w-md">
            Notunu aldık. Aradığın ürünü stoğa alır/üretirsek, e-posta bıraktıysan haber vereceğiz.
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-olive-700 font-black text-xs uppercase tracking-widest mb-2">
              <Search size={16} /> Aradığını bulamadın mı?
            </div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight italic">Ne aradığını yaz, biz halledelim.</h3>
            <p className="text-sm text-slate-500 mt-2">
              İstediğin numara, renk ya da model burada yoksa yaz — talep çok gelirse üretir/stoğa alırız.
              E-posta bırakırsan gelince sana haber veririz.
            </p>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Örn: Kırmızı 40 numara babet arıyorum, sadece siyah vardı."
              className="w-full min-h-[90px] rounded-2xl border-2 border-slate-100 bg-white px-4 py-3 text-sm focus:outline-none focus:border-olive-400 resize-none"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-posta (opsiyonel — haber vermemiz için)"
              className="w-full h-12 rounded-2xl border-2 border-slate-100 bg-white px-4 text-sm focus:outline-none focus:border-olive-400"
            />
            {error && <p className="text-xs font-bold text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-2xl bg-olive-600 text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-olive-700 active:scale-95 transition-all disabled:opacity-60"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Gönder
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
