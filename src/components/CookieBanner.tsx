"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie, X, Lock } from "lucide-react";
import { CONSENT_KEY, CONSENT_OPEN_EVENT, consentChoice, setConsent, type ConsentChoice } from "@/lib/consent";
import { sendConsent } from "@/lib/track";

// KVKK çerez onayı — kategorili (zorunlu / istatistik / pazarlama). İlk ziyarette görünür; seçim localStorage'da.
// İlk ekran: [Tümünü Kabul Et] (öne çıkan) · [Tercihler] · [Reddet] — üçü aynı boyutta, reddetmek kabul kadar kolay.
// Tercihler: kategori anahtarları KAPALI başlar (önceden işaretli onay geçersizdir).
// Seçim: onay defterine + bu ziyaretin kaydına yazılır (src/lib/track.ts sendConsent → /api/track).
// Alt bilgideki "Çerez Tercihleri" pencereyi yeniden açar (src/components/CookiePreferencesLink.tsx).

const ALL: ConsentChoice = { stats: true, marketing: true };
const NONE: ConsentChoice = { stats: false, marketing: false };

function Toggle({ on, onChange, locked }: { on: boolean; onChange?: (v: boolean) => void; locked?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} disabled={locked}
      onClick={() => onChange?.(!on)}
      className={`relative w-12 h-7 rounded-full shrink-0 transition-colors ${on ? "bg-olive-600" : "bg-slate-300"} ${locked ? "opacity-60" : ""}`}
    >
      <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}

export default function CookieBanner() {
  const [show, setShow] = useState(false);
  const [prefs, setPrefs] = useState(false);
  const [draft, setDraft] = useState<ConsentChoice>(NONE);

  useEffect(() => {
    try {
      if (!localStorage.getItem(CONSENT_KEY)) setShow(true);
    } catch {
      /* yut */
    }
    // "Çerez tercihlerini değiştir" bağlantısı pencereyi tercihler ekranıyla yeniden açar
    const reopen = () => { setDraft(consentChoice() ?? NONE); setPrefs(true); setShow(true); };
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    // Panelden düzenlenen sayfa metinlerindeki bağlantı ({{cerez_tercihleri}} → <a data-cookie-prefs>)
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("[data-cookie-prefs]");
      if (a) { e.preventDefault(); reopen(); }
    };
    document.addEventListener("click", onClick);
    return () => { window.removeEventListener(CONSENT_OPEN_EVENT, reopen); document.removeEventListener("click", onClick); };
  }, []);

  function choose(choice: ConsentChoice) {
    const before = consentChoice();
    setConsent(choice); // kaydeder + "yh:consent" olayı → GA / Meta Pixel (MarketingTags) hemen güncellenir
    sendConsent(choice); // onay defteri + ziyaret kaydında seçim (reddedildiyse kayıt anonimleşir)
    setShow(false);
    setPrefs(false);
    // Önceden verilmiş izin geri alındıysa yüklenmiş etiketler sayfa yenilenince kalkar
    if ((before?.marketing && !choice.marketing) || (before?.stats && !choice.stats)) window.location.reload();
  }

  if (!show) return null;

  const btn = "h-11 rounded-xl font-bold text-sm active:scale-95 transition-all";
  const outline = `${btn} border border-slate-300 text-slate-700 bg-white hover:bg-slate-50`;
  const primary = `${btn} bg-olive-600 hover:bg-olive-700 text-white`;

  // ── Tercihler ──
  if (prefs) {
    const row = (title: string, desc: string, control: React.ReactNode) => (
      <div className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
        <div className="flex-1 min-w-0">
          <p className="font-black text-slate-900 text-sm">{title}</p>
          <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{desc}</p>
        </div>
        {control}
      </div>
    );
    return (
      <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm p-3 md:p-4 animate-in fade-in">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-4">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Cookie size={18} className="text-olive-600" />
              <h2 className="font-black text-slate-900">Çerez tercihleri</h2>
            </div>
            <button onClick={() => (consentChoice() ? setShow(false) : setPrefs(false))} aria-label="Kapat" className="p-1 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-2">
            {row("Zorunlu", "Sepet, oturum açma, güvenlik ve çerez tercihiniz. Bunlar olmadan site çalışmaz.",
              <span className="flex items-center gap-1 text-[11px] font-bold text-slate-400 shrink-0"><Lock size={12} /> Her zaman açık</span>)}
            {row("İstatistik", "Hangi sayfaların ziyaret edildiğini anlamamıza yardım eder (kendi ziyaret analizimiz ve Google Analytics). Kapalıysa ziyaretiniz kimliğinizle ilişkilendirilmeden, IP adresi saklanmadan yalnız sayılır.",
              <Toggle on={draft.stats} onChange={(v) => setDraft((d) => ({ ...d, stats: v }))} />)}
            {row("Pazarlama", "Instagram ve Facebook reklamlarımızın sonucunu ölçmek için Meta Pixel. Kapalıysa hiç yüklenmez.",
              <Toggle on={draft.marketing} onChange={(v) => setDraft((d) => ({ ...d, marketing: v }))} />)}
            <p className="text-xs text-slate-500 py-3">
              Ayrıntılar: <Link href="/cerez-politikasi" target="_blank" className="text-olive-700 font-bold underline">Çerez Politikası</Link>
            </p>
          </div>
          <div className="px-5 py-4 border-t border-slate-100 grid grid-cols-2 gap-2">
            <button onClick={() => choose(draft)} className={outline}>Seçimi Kaydet</button>
            <button onClick={() => choose(ALL)} className={primary}>Tümünü Kabul Et</button>
          </div>
        </div>
      </div>
    );
  }

  // ── İlk ekran (kompakt) ──
  return (
    <div className="fixed inset-x-3 z-[60] bottom-[76px] md:bottom-4 md:inset-x-auto md:right-4 md:max-w-md">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-olive-50 text-olive-600 flex items-center justify-center shrink-0">
            <Cookie size={20} />
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            Deneyimini iyileştirmek, ziyaretleri analiz etmek ve reklamlarımızı ölçmek için çerez kullanıyoruz. Ayrıntılar:{" "}
            <Link href="/cerez-politikasi" className="text-olive-700 font-bold underline">Çerez Politikası</Link>.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => choose(NONE)} className={outline}>Reddet</button>
          <button onClick={() => { setDraft(consentChoice() ?? NONE); setPrefs(true); }} className={outline}>Tercihler</button>
          <button onClick={() => choose(ALL)} className={`${primary} text-[13px] leading-tight px-1`}>Tümünü Kabul Et</button>
        </div>
      </div>
    </div>
  );
}
