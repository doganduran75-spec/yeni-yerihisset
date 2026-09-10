"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { track, setTrackUser, initTrackFlush } from "@/lib/track";

/**
 * İki iş yapar:
 * 1) Üyenin last_active_at'ini günceller (CRM için, saatte bir throttle).
 * 2) First-party analitik: her sayfa değişiminde page_view; login'liyse kimliği
 *    tracker'a bildirir (yolculukta "üye adımı"). GA'ya paralel çalışır.
 */
export default function VisitTracker() {
  const pathname = usePathname();

  // Bir kez: kimliği yakala + son aktiflik + sayfa kapanış flush'ı
  useEffect(() => {
    initTrackFlush();
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setTrackUser(user?.id ?? null);

        if (!user) return;
        const KEY = "yh:lastActivePing";
        const last = Number(localStorage.getItem(KEY) || 0);
        if (Date.now() - last < 60 * 60 * 1000) return; // saatte bir
        await supabase
          .from("profiles")
          .update({ last_active_at: new Date().toISOString() } as any)
          .eq("id", user.id);
        localStorage.setItem(KEY, String(Date.now()));
      } catch {
        /* sessiz — takip kritik değil */
      }
    })();

    // Oturum değişiminde (giriş/çıkış) kimliği güncelle
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setTrackUser(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Her rota değişiminde sayfa görüntüleme
  useEffect(() => {
    if (!pathname) return;
    track("page_view", { title: typeof document !== "undefined" ? document.title : undefined });
  }, [pathname]);

  return null;
}
