"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

function VerifyInner() {
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    if (!token) { setState("error"); return; }
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        setState(res.ok ? "ok" : "error");
      } catch {
        setState("error");
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center items-center p-4">
      <Link href="/" className="mb-8 text-3xl font-black tracking-tighter text-olive-600">
        Yeri<span className="text-slate-900">Hisset</span>
      </Link>
      <div className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl shadow-slate-200/50 p-8 md:p-10 text-center">
        {state === "loading" && (
          <div className="py-6 flex flex-col items-center gap-3 text-slate-500">
            <Loader2 className="animate-spin" size={28} />
            <p className="text-sm font-medium">E-posta onaylanıyor…</p>
          </div>
        )}
        {state === "ok" && (
          <div className="space-y-4">
            <CheckCircle2 className="text-green-500 mx-auto" size={48} />
            <h1 className="text-xl font-black text-slate-900">E-postan onaylandı 🎉</h1>
            <p className="text-sm text-slate-500">Teşekkürler! Artık tüm bildirimleri doğru adresine iletebiliriz.</p>
            <Link href="/products" className="inline-block bg-olive-600 hover:bg-olive-700 text-white font-bold rounded-xl px-6 py-3 text-sm transition-colors">
              Alışverişe Devam Et
            </Link>
          </div>
        )}
        {state === "error" && (
          <div className="space-y-4">
            <AlertCircle className="text-amber-500 mx-auto" size={48} />
            <h1 className="text-xl font-black text-slate-900">Bağlantı geçersiz</h1>
            <p className="text-sm text-slate-500">Bu onay bağlantısı geçersiz ya da zaten kullanılmış olabilir. Hesabından yeni bir onay bağlantısı isteyebilirsin.</p>
            <Link href="/account" className="inline-block bg-white border border-slate-200 text-slate-700 font-bold rounded-xl px-6 py-3 text-sm hover:bg-slate-50 transition-colors">
              Hesabıma Git
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EmailVerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyInner />
    </Suspense>
  );
}
