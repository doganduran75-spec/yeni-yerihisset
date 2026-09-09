"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Fikir B (temel): giriş yapmış üyenin son aktiflik tarihini (last_active_at)
 * günceller. Saatte bir (localStorage throttle) — gereksiz yazma yok.
 * CRM otomasyonu ("uyku sonrası dönenler" + hatırlatma) sonra bunun üstüne kurulur.
 */
export default function VisitTracker() {
  useEffect(() => {
    (async () => {
      try {
        const KEY = "yh:lastActivePing";
        const last = Number(localStorage.getItem(KEY) || 0);
        if (Date.now() - last < 60 * 60 * 1000) return; // saatte bir
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await supabase.from("profiles").update({ last_active_at: new Date().toISOString() } as any).eq("id", user.id);
        localStorage.setItem(KEY, String(Date.now()));
      } catch {
        /* sessiz — takip kritik değil */
      }
    })();
  }, []);
  return null;
}
