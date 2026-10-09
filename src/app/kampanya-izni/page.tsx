"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, AlertCircle, Loader2, Mail } from "lucide-react";

// E-postadaki "kampanya e-postası" bağlantısı: izin ver ya da (?cik=1) izni geri al.
// İzin, bağlantı açılınca DEĞİL düğmeye basılınca değişir (e-posta tarayıcıları bağlantıyı önceden açar).
function ConsentInner() {
  const params = useSearchParams();
  const t = params.get("t") || "";
  const optOut = params.get("cik") === "1";
  const [state, setState] = useState<"loading" | "ready" | "saving" | "done" | "error">(t ? "loading" : "error");
  const [granted, setGranted] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!t) return;
    fetch(`/api/marketing-consent?t=${encodeURIComponent(t)}`, { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) { setState("error"); return; }
        setGranted(!!j.granted); setEmail(j.email ?? null); setState("ready");
      })
      .catch(() => setState("error"));
  }, [t]);

  async function save(value: boolean) {
    setState("saving");
    try {
      const res = await fetch("/api/marketing-consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t, granted: value }) });
      if (!res.ok) { setState("error"); return; }
      setGranted(value); setState("done");
    } catch { setState("error"); }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center items-center p-4">
      <Link href="/" className="mb-8 text-3xl font-black tracking-tighter text-olive-600">
        Yeri<span className="text-slate-900">Hisset</span>
      </Link>
      <div className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl shadow-slate-200/50 p-8 md:p-10 text-center">
        {(state === "loading" || state === "saving") && (
          <div className="py-6 flex flex-col items-center gap-3 text-slate-500">
            <Loader2 className="animate-spin" size={28} />
          </div>
        )}
        {state === "ready" && (
          <div className="space-y-4">
            <Mail className="text-olive-600 mx-auto" size={44} />
            {optOut ? (
              <>
                <h1 className="text-xl font-black text-slate-900">Kampanya e-postalarından çık</h1>
                <p className="text-sm text-slate-500">{email} adresine kampanya ve indirim e-postası göndermeyelim mi? Sipariş ve kargo bilgilendirmeleri gelmeye devam eder.</p>
                <button onClick={() => save(false)} className="w-full h-12 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm">Evet, kampanya e-postası istemiyorum</button>
              </>
            ) : granted ? (
              <>
                <h1 className="text-xl font-black text-slate-900">Zaten kayıtlısın 👍</h1>
                <p className="text-sm text-slate-500">{email} adresine kampanya ve indirim haberlerini gönderiyoruz.</p>
                <button onClick={() => save(false)} className="text-sm text-slate-500 underline">Kampanya e-postası almak istemiyorum</button>
              </>
            ) : (
              <>
                <h1 className="text-xl font-black text-slate-900">Kampanyalardan haberdar ol</h1>
                <p className="text-sm text-slate-500">{email} adresine indirim, yeni ürün ve kampanya e-postaları gönderelim mi? İstediğin zaman tek tıkla çıkabilirsin.</p>
                <button onClick={() => save(true)} className="w-full h-12 rounded-xl bg-olive-600 hover:bg-olive-700 text-white font-bold text-sm">Evet, kampanya e-postası almak istiyorum</button>
              </>
            )}
          </div>
        )}
        {state === "done" && (
          <div className="space-y-4">
            <CheckCircle2 className="text-green-500 mx-auto" size={48} />
            <h1 className="text-xl font-black text-slate-900">{granted ? "Kaydedildi 🎉" : "Kampanya e-postalarından çıktın"}</h1>
            <p className="text-sm text-slate-500">{granted ? "Kampanya ve indirimlerden ilk sen haberdar olacaksın." : "Artık kampanya e-postası göndermeyeceğiz. Fikrini Hesabım › İletişim tercihleri’nden değiştirebilirsin."}</p>
            <Link href="/magaza" className="inline-block bg-olive-600 hover:bg-olive-700 text-white font-bold rounded-xl px-6 py-3 text-sm transition-colors">Alışverişe Devam Et</Link>
          </div>
        )}
        {state === "error" && (
          <div className="space-y-4">
            <AlertCircle className="text-amber-500 mx-auto" size={48} />
            <h1 className="text-xl font-black text-slate-900">Bağlantı geçersiz</h1>
            <p className="text-sm text-slate-500">Bu bağlantı geçersiz. Tercihini Hesabım › İletişim tercihleri’nden değiştirebilirsin.</p>
            <Link href="/account" className="inline-block bg-white border border-slate-200 text-slate-700 font-bold rounded-xl px-6 py-3 text-sm hover:bg-slate-50 transition-colors">Hesabıma Git</Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function KampanyaIzniPage() {
  return (
    <Suspense fallback={null}>
      <ConsentInner />
    </Suspense>
  );
}
