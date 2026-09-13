"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";

// KVKK çerez onay banner'ı. İlk ziyarette görünür; seçim localStorage'da tutulur.
// "Reddet" seçilirse first-party analitiğimiz (src/lib/track.ts) devre dışı kalır.
// NOT: GA'yı da onaya bağlamak ayrı bir adım (şimdilik iskelet).
const KEY = "yh:cookie-consent"; // "accepted" | "rejected"

export default function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      /* yut */
    }
  }, []);

  function choose(value: "accepted" | "rejected") {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* yut */
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-x-3 z-[60] bottom-[76px] md:bottom-4 md:inset-x-auto md:right-4 md:max-w-md">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-olive-50 text-olive-600 flex items-center justify-center shrink-0">
            <Cookie size={20} />
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            Deneyimini iyileştirmek ve ziyaret istatistiklerini analiz etmek için çerezler kullanıyoruz.
            Ayrıntılar için{" "}
            <Link href="/cerez-politikasi" className="text-olive-700 font-bold underline">Çerez Politikası</Link>.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => choose("rejected")}
            className="flex-1 h-10 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 active:scale-95 transition-all"
          >
            Reddet
          </button>
          <button
            onClick={() => choose("accepted")}
            className="flex-1 h-10 rounded-xl bg-olive-600 hover:bg-olive-700 text-white font-bold text-sm active:scale-95 transition-all"
          >
            Kabul Et
          </button>
        </div>
      </div>
    </div>
  );
}
