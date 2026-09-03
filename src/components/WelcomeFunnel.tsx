"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Footprints, Sparkles, ArrowRight, X, PlayCircle, BookOpen, Store } from "lucide-react";

const SEEN_KEY = "yh_funnel_seen";
type Step = "ask" | "info" | "shop";

export default function WelcomeFunnel() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("ask");
  const [categories, setCategories] = useState<{ name: string; slug: string }[]>([]);

  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === "1"; } catch { /* yoksay */ }
    // ?funnel=1 ile (menüdeki butondan) her zaman aç
    const forced = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("funnel") === "1";
    if (!seen || forced) { setStep("ask"); setOpen(true); }
    (async () => {
      const { data } = await (supabase as any).from("categories").select("name, slug").order("name");
      setCategories((data as any[])?.filter((c) => c.slug) ?? []);
    })();

    // Aynı sayfadan tekrar açmak için (menü butonu olay yayınlar)
    const handler = () => { setStep("ask"); setOpen(true); };
    window.addEventListener("yh:open-funnel", handler);
    return () => window.removeEventListener("yh:open-funnel", handler);
  }, []);

  function dismiss() {
    try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* yoksay */ }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95">
        {/* Kapat */}
        <div className="flex justify-end p-4 pb-0">
          <button onClick={dismiss} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100" title="Kapat">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 md:px-10 pb-10 -mt-2">
          {step === "ask" && (
            <div className="space-y-6 text-center">
              <div>
                <div className="w-16 h-16 mx-auto bg-olive-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-olive-100 mb-4">Y</div>
                <h2 className="text-2xl md:text-3xl font-black text-slate-900">Hoş geldin! 👋</h2>
                <p className="text-slate-500 mt-1">Sana en iyi şekilde yardımcı olalım — bugün buraya neden geldin?</p>
              </div>

              <div className="grid gap-3">
                <button onClick={() => setStep("info")}
                  className="group flex items-center gap-4 p-5 rounded-2xl border-2 border-slate-100 hover:border-olive-400 hover:bg-olive-50/40 transition-all text-left">
                  <div className="w-12 h-12 rounded-xl bg-olive-100 flex items-center justify-center shrink-0">
                    <Footprints size={22} className="text-olive-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-black text-slate-900">Barefoot nedir merak ettim</p>
                    <p className="text-sm text-slate-500">Çıplak ayak ayakkabıları tanıyayım</p>
                  </div>
                  <ArrowRight size={18} className="text-slate-300 group-hover:text-olive-600 group-hover:translate-x-1 transition-all" />
                </button>

                <button onClick={() => setStep("shop")}
                  className="group flex items-center gap-4 p-5 rounded-2xl border-2 border-slate-100 hover:border-olive-400 hover:bg-olive-50/40 transition-all text-left">
                  <div className="w-12 h-12 rounded-xl bg-olive-100 flex items-center justify-center shrink-0">
                    <Sparkles size={22} className="text-olive-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-black text-slate-900">Ayakkabı modelini beğendim</p>
                    <p className="text-sm text-slate-500">Doğrudan mağazaya gideyim</p>
                  </div>
                  <ArrowRight size={18} className="text-slate-300 group-hover:text-olive-600 group-hover:translate-x-1 transition-all" />
                </button>

                <button onClick={dismiss}
                  className="text-sm font-bold text-slate-400 hover:text-slate-600 py-2">
                  Yönlendirmeyi kapat, klasik ekrana geç →
                </button>
              </div>
            </div>
          )}

          {step === "info" && (
            <div className="space-y-5">
              <button onClick={() => setStep("ask")} className="text-xs font-bold text-slate-400 hover:text-slate-600">← Geri</button>
              <h2 className="text-2xl font-black text-slate-900">Barefoot (Çıplak Ayak) Ayakkabı Nedir?</h2>

              {/* Video placeholder — admin sonra gerçek videoyu koyar */}
              <div className="aspect-video rounded-2xl bg-slate-100 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-2">
                <PlayCircle size={40} />
                <span className="text-sm font-medium">Tanıtım videosu yakında</span>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed">
                Barefoot ayakkabılar; geniş burun yapısı, ince ve esnek taban ve sıfır topuk farkı ile ayağının
                doğal hareketini destekler. Ayak kaslarını güçlendirir, duruşunu iyileştirir.
              </p>

              <div className="grid sm:grid-cols-2 gap-3">
                <Link href="/bilgi-bankasi" onClick={dismiss}
                  className="flex items-center gap-3 p-4 rounded-xl border-2 border-slate-100 hover:border-olive-300 transition-all">
                  <BookOpen size={20} className="text-olive-600" />
                  <span className="font-bold text-sm text-slate-800">Bilgi Bankası — Yazılar</span>
                </Link>
                <Link href="/products" onClick={dismiss}
                  className="flex items-center gap-3 p-4 rounded-xl bg-olive-600 text-white hover:bg-olive-700 transition-all">
                  <Store size={20} />
                  <span className="font-bold text-sm">Mağazaya Geç</span>
                </Link>
              </div>
            </div>
          )}

          {step === "shop" && (
            <div className="space-y-5">
              <button onClick={() => setStep("ask")} className="text-xs font-bold text-slate-400 hover:text-slate-600">← Geri</button>
              <h2 className="text-2xl font-black text-slate-900">Ne arıyorsun?</h2>
              <p className="text-slate-500 text-sm -mt-3">Bir kategori seç, doğrudan oraya götürelim.</p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {categories.map((cat) => (
                  <Link key={cat.slug} href={`/kategori/${cat.slug}`} onClick={dismiss}
                    className="p-4 rounded-2xl border-2 border-slate-100 hover:border-olive-400 hover:bg-olive-50/40 transition-all text-center font-black text-slate-800 uppercase italic text-sm">
                    {cat.name}
                  </Link>
                ))}
                <Link href="/products" onClick={dismiss}
                  className="p-4 rounded-2xl bg-olive-600 text-white hover:bg-olive-700 transition-all text-center font-black uppercase italic text-sm flex items-center justify-center gap-1">
                  Hepsi <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
