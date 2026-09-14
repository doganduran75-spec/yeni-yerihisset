"use client";

import { useEffect, useState } from "react";
import { Cookie, X } from "lucide-react";

// KVKK çerez onay banner'ı. İlk ziyarette görünür; seçim localStorage'da tutulur.
// "Çerez Politikası" → sayfadan AYRILMADAN aynı popup içinde politika metnini açar;
// altındaki Onayla/Reddet ile ziyaret kesintisiz sürer.
// "Reddet" seçilirse first-party analitiğimiz (src/lib/track.ts) devre dışı kalır.
const KEY = "yh:cookie-consent"; // "accepted" | "rejected"

export default function CookieBanner() {
  const [show, setShow] = useState(false);
  const [expanded, setExpanded] = useState(false);

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

  // Alt kısımdaki onay/ret butonları (her iki görünümde ortak)
  const actions = (
    <div className="flex gap-2">
      <button
        onClick={() => choose("rejected")}
        className="flex-1 h-11 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 active:scale-95 transition-all"
      >
        Reddet
      </button>
      <button
        onClick={() => choose("accepted")}
        className="flex-1 h-11 rounded-xl bg-olive-600 hover:bg-olive-700 text-white font-bold text-sm active:scale-95 transition-all"
      >
        Kabul Et
      </button>
    </div>
  );

  // ── Genişletilmiş: politika metni popup içinde (sayfadan ayrılmadan) ──
  if (expanded) {
    return (
      <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm p-3 md:p-4 animate-in fade-in">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-4">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Cookie size={18} className="text-olive-600" />
              <h2 className="font-black text-slate-900">Çerez Politikası</h2>
            </div>
            <button onClick={() => setExpanded(false)} aria-label="Kapat" className="p-1 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>

          <div className="overflow-y-auto px-5 py-4 space-y-4 text-sm text-slate-600 leading-relaxed">
            <p>
              YeriHisset olarak, sitemizi kullanımınızı kolaylaştırmak ve ziyaret istatistiklerini analiz
              etmek için çerezler kullanıyoruz.
            </p>
            <div>
              <h3 className="font-black text-slate-900 mb-1">Zorunlu çerezler</h3>
              <p>Sepet, oturum ve güvenlik gibi sitenin çalışması için gerekli olan çerezler. Bunlar kapatılamaz.</p>
            </div>
            <div>
              <h3 className="font-black text-slate-900 mb-1">Analitik çerezler</h3>
              <p>
                Hangi sayfaların ziyaret edildiğini ve deneyimin nasıl iyileştirilebileceğini anlamak için
                kullanılır (Google Analytics ve kendi ziyaret analizimiz). <b>Reddet</b> derseniz bu analiz
                çerezleri devreye girmez.
              </p>
            </div>
            <p className="text-slate-500">
              Tercihinizi istediğiniz zaman tarayıcı ayarlarınızdan da yönetebilirsiniz.
            </p>
          </div>

          <div className="px-5 py-4 border-t border-slate-100">{actions}</div>
        </div>
      </div>
    );
  }

  // ── Kompakt banner ──
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
            <button onClick={() => setExpanded(true)} className="text-olive-700 font-bold underline">
              Çerez Politikası
            </button>
            .
          </p>
        </div>
        {actions}
      </div>
    </div>
  );
}
