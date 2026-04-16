"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { X } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type PopupConfig = {
  id: string;
  is_active: boolean;
  title: string;
  content: string;
  button_text: string;
  button_url: string;
  delay_seconds: number;
  cooldown_days: number;
};

const LS_KEY = "popup_shown_at";

export default function PopupBanner() {
  const [popup, setPopup] = useState<PopupConfig | null>(null);
  const [visible, setVisible] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  const dismiss = useCallback(() => {
    setAnimateIn(false);
    setTimeout(() => setVisible(false), 300);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    async function init() {
      // 1. Giriş yapılmış mı?
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 2. Popup ayarlarını al
      const { data: cfg } = await supabase
        .from("popup_config")
        .select("*")
        .single();

      if (!cfg || !cfg.is_active) return;

      // 3. Bu kullanıcıya cooldown süresi geçmeden gösterme
      const { data: impression } = await supabase
        .from("popup_impressions")
        .select("shown_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (impression?.shown_at && cfg.cooldown_days > 0) {
        const shownAt = new Date(impression.shown_at).getTime();
        const cooldownMs = cfg.cooldown_days * 24 * 60 * 60 * 1000;
        if (Date.now() - shownAt < cooldownMs) return;
      }

      // 4. localStorage ek kontrol (hızlı önbellek)
      const lsShownAt = localStorage.getItem(LS_KEY);
      if (lsShownAt && cfg.cooldown_days > 0) {
        const cooldownMs = cfg.cooldown_days * 24 * 60 * 60 * 1000;
        if (Date.now() - Number(lsShownAt) < cooldownMs) return;
      }

      // 5. Delay sonrası göster
      setPopup(cfg);
      timer = setTimeout(async () => {
        setVisible(true);
        requestAnimationFrame(() => setTimeout(() => setAnimateIn(true), 10));

        // 6. İzlenimi kaydet
        const now = new Date().toISOString();
        localStorage.setItem(LS_KEY, String(Date.now()));
        await supabase.from("popup_impressions").upsert(
          { user_id: user.id, shown_at: now },
          { onConflict: "user_id" }
        );
      }, (cfg.delay_seconds || 0) * 1000);
    }

    init();
    return () => clearTimeout(timer);
  }, []);

  // ESC tuşu ile kapat
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, dismiss]);

  if (!visible || !popup) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300",
        animateIn ? "bg-black/50 backdrop-blur-sm" : "bg-black/0"
      )}
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div
        className={cn(
          "relative bg-white rounded-3xl shadow-2xl w-full max-w-md transition-all duration-300",
          animateIn ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-4 scale-95"
        )}
      >
        {/* Kapatma butonu */}
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors z-10"
          aria-label="Kapat"
        >
          <X size={14} />
        </button>

        <div className="p-8">
          {/* Başlık */}
          {popup.title && (
            <h2 className="text-2xl font-black text-slate-900 mb-4 pr-8 leading-tight">
              {popup.title}
            </h2>
          )}

          {/* İçerik */}
          {popup.content && (
            <div
              className="text-sm text-slate-600 leading-relaxed mb-6 prose prose-sm max-w-none prose-a:text-blue-600 prose-strong:text-slate-800"
              dangerouslySetInnerHTML={{ __html: popup.content }}
            />
          )}

          {/* CTA Butonu */}
          {popup.button_text && (
            <div className="flex gap-3">
              {popup.button_url ? (
                <Link
                  href={popup.button_url}
                  onClick={dismiss}
                  className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-6 py-3 rounded-xl transition-colors"
                >
                  {popup.button_text}
                </Link>
              ) : (
                <button
                  onClick={dismiss}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-6 py-3 rounded-xl transition-colors"
                >
                  {popup.button_text}
                </button>
              )}
              <button
                onClick={dismiss}
                className="text-sm text-slate-400 hover:text-slate-600 transition-colors px-2"
              >
                Kapat
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
