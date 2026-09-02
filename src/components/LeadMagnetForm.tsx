"use client";

import { useState } from "react";
import { Truck, Loader2, CheckCircle2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Fırsat: e-posta karşılığı ücretsiz kargo (lead magnet).
 * couponCode: admin'in oluşturduğu free_shipping kuponunun kodu.
 */
export default function LeadMagnetForm({ couponCode = "KARGOBEDAVA" }: { couponCode?: string }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<null | "created" | "existing">(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!consent) { setError("Lütfen onay kutusunu işaretleyin."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/lead-magnet/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), consent, couponCode }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Bir hata oluştu.");
      setDone(d.status === "existing" ? "existing" : "created");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-10 rounded-3xl overflow-hidden shadow-xl shadow-olive-100 border border-olive-100 bg-gradient-to-br from-olive-600 to-olive-700 text-white">
      <div className="p-6 md:p-8 grid md:grid-cols-2 gap-6 items-center">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 bg-white/15 rounded-full px-3 py-1 text-xs font-black uppercase tracking-widest">
            <Truck size={14} /> Fırsat
          </div>
          <h2 className="text-2xl md:text-3xl font-black leading-tight">Ücretsiz Kargo Senin Olsun</h2>
          <p className="text-olive-100 text-sm md:text-base">
            Sadece e-posta adresini bırak, <b className="text-white">ücretsiz kargo</b> kuponunu anında hesabına tanımlayalım.
            Basit bir bilgiyle <b className="text-white">150₺'ye varan</b> kargo tasarrufu.
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 text-slate-900">
          {done ? (
            <div className="text-center py-4 space-y-2">
              <CheckCircle2 size={40} className="text-green-500 mx-auto" />
              <p className="font-black text-lg">Kuponun hazır! 🎉</p>
              <p className="text-sm text-slate-500">
                {done === "created"
                  ? "E-postana giriş & şifre belirleme bağlantısı gönderdik. Oradan şifreni belirleyip kuponu kullanabilirsin."
                  : "Bu e-posta zaten kayıtlı — kuponu hesabına ekledik. Giriş yapıp kullanabilirsin."}
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="E-posta adresin"
                  className="h-12 pl-9 rounded-xl border-slate-200"
                />
              </div>
              <label className="flex items-start gap-2 text-[11px] text-slate-500 leading-snug cursor-pointer">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
                <span>E-posta ile üye olmayı ve kampanya iletileri almayı kabul ediyorum. (Dilediğinde çıkabilirsin.)</span>
              </label>
              {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
              <Button type="submit" disabled={loading} className="w-full h-12 rounded-xl bg-olive-600 hover:bg-olive-700 font-black">
                {loading ? <Loader2 size={16} className="animate-spin" /> : "Ücretsiz Kargoyu Al"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
