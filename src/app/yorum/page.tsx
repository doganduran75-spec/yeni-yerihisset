"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// YORUM — yorum isteme e-postasındaki yıldızdan gelinir (/yorum?t=…&p=N). Giriş gerekmez.
// Genel puan (e-postada dokunulan yıldız dolu gelir) + Ayarlar'daki sorular (yıldız / seçenek) + yorum.
// Sorular sonradan değişebilir: cevaplar soru metniyle saklanır (src/lib/review-winback.ts).
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useBotTrap } from "@/components/BotTrap";

type Q = { key: string; label: string; type: "stars" | "choice"; options?: string[] };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center p-4 py-10">
      <Link href="/" className="mb-6 text-3xl font-black tracking-tighter text-olive-600">Yeri<span className="text-slate-900">Hisset</span></Link>
      <div className="w-full max-w-lg bg-white rounded-[2rem] shadow-2xl shadow-slate-200/50 p-6 md:p-8">{children}</div>
    </div>
  );
}

function Stars({ value, onChange, size = "text-4xl" }: { value: number; onChange: (n: number) => void; size?: string }) {
  return (
    <div className="flex justify-center gap-1.5" role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" aria-label={`${n} yıldız`} onClick={() => onChange(n)}
          className={`${size} leading-none transition-transform active:scale-90 ${n <= value ? "text-amber-400" : "text-slate-200"}`}>★</button>
      ))}
    </div>
  );
}

function ReviewForm() {
  const sp = useSearchParams();
  const t = sp.get("t") || "";
  const bot = useBotTrap();
  const [ctx, setCtx] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [overall, setOverall] = useState(() => Math.min(5, Math.max(0, Number(sp.get("p")) || 0)));
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/review?t=${encodeURIComponent(t)}`).then((r) => r.json().then((j) => ({ r, j }))).then(({ r, j }) => {
      if (!r.ok) setErr(j.error || "Bağlantı geçersiz."); else { setCtx(j); if (j.done) setDone(true); }
    }).catch(() => setErr("Bağlantı hatası."));
  }, [t]);

  async function send() {
    if (!overall) { setErr("Genel puanı seç."); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/review", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t, overall, answers, comment, ...bot.fields() }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Gönderilemedi.");
      setDone(true);
    } catch (e: any) { setErr(e?.message || "Gönderilemedi."); }
    finally { setBusy(false); }
  }

  if (err && !ctx) return <Shell><p className="flex items-center gap-2 text-red-600"><AlertCircle size={18} /> {err}</p></Shell>;
  if (!ctx) return <Shell><Loader2 className="mx-auto animate-spin text-slate-400" /></Shell>;
  if (done) return (
    <Shell>
      <div className="text-center space-y-3">
        <CheckCircle2 size={44} className="mx-auto text-olive-600" />
        <h1 className="text-xl font-black text-slate-900">Teşekkürler{ctx.firstName ? `, ${ctx.firstName}` : ""}!</h1>
        <p className="text-sm text-slate-600">Yorumun bize ulaştı. Kontrol edildikten sonra ürün sayfasında yayınlanacak.</p>
        <Link href="/magaza" className="inline-block mt-2 text-sm font-bold text-olive-700 underline">Mağazaya dön</Link>
      </div>
    </Shell>
  );

  return (
    <Shell>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="space-y-6">
        {bot.trap}
        <div className="text-center space-y-2">
          <h1 className="text-xl font-black text-slate-900">Deneyimini paylaşır mısın{ctx.firstName ? `, ${ctx.firstName}` : ""}?</h1>
          <p className="text-sm text-slate-500">{ctx.items.map((i: any) => i.title).join(" · ")}</p>
        </div>
        <div className="space-y-2 text-center">
          <p className="text-sm font-bold text-slate-800">Genel olarak kaç puan verirsin?</p>
          <Stars value={overall} onChange={setOverall} />
        </div>
        {(ctx.questions as Q[]).map((q) => (
          <div key={q.key} className="space-y-2 text-center">
            <p className="text-sm font-bold text-slate-800">{q.label}</p>
            {q.type === "stars" ? (
              <Stars value={Number(answers[q.key] || 0)} onChange={(n) => setAnswers((a) => ({ ...a, [q.key]: n }))} size="text-3xl" />
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                {(q.options || []).map((o) => (
                  <button key={o} type="button" onClick={() => setAnswers((a) => ({ ...a, [q.key]: o }))}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold ${answers[q.key] === o ? "border-olive-600 bg-olive-50 text-olive-800" : "border-slate-200 text-slate-600"}`}>{o}</button>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="space-y-2">
          <p className="text-sm font-bold text-slate-800 text-center">Yorumun <span className="font-normal text-slate-400">(isteğe bağlı)</span></p>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} maxLength={2000}
            placeholder="Neyi sevdin, kimlere önerirsin, geçiş nasıl geçti…" className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-olive-300" />
        </div>
        {err && <p className="text-sm text-red-600 text-center">{err}</p>}
        <button type="submit" disabled={busy || !overall} className="w-full rounded-xl bg-olive-600 py-3 text-sm font-black text-white disabled:opacity-50">
          {busy ? <Loader2 size={16} className="mx-auto animate-spin" /> : "Gönder"}
        </button>
      </form>
    </Shell>
  );
}

export default function ReviewPage() {
  return <Suspense fallback={<Shell><Loader2 className="mx-auto animate-spin text-slate-400" /></Shell>}><ReviewForm /></Suspense>;
}
