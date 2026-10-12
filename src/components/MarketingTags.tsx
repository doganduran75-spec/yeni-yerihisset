"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { consentChoice, onConsent, type ConsentChoice } from "@/lib/consent";
import { captureAdSource } from "@/lib/ad-context";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Pazarlama etiketleri — ÇEREZ ONAYINA BAĞLI (KVKK):
//  * Meta Pixel yalnız "Kabul Et"ten sonra yüklenir (önce hiç istek gitmez, çerez yazılmaz).
//  * Google Analytics consent mode: varsayılan "denied" (GoogleAnalytics.tsx), onayda "granted".
//  * Reklam kaynağı (utm/fbclid) her açılışta yakalanır (yalnız bu tarayıcıda saklanır).
// Olaylar (ViewContent, AddToCart, InitiateCheckout, Purchase) src/lib/analytics.ts'ten gider.

function loadPixel(pixelId: string) {
  const w = window as any;
  if (w.fbq) return;
  const n: any = (w.fbq = function (...args: any[]) {
    if (n.callMethod) n.callMethod(...args); else n.queue.push(args);
  });
  if (!w._fbq) w._fbq = n;
  n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(s);
  w.fbq("init", pixelId);
  w.fbq("track", "PageView");
}

// İstatistik izni → GA ölçüm çerezleri; pazarlama izni → reklam çerezleri + Meta Pixel
function updateGa(c: ConsentChoice) {
  const w = window as any;
  if (c.stats && typeof w.__yhGA === "function") w.__yhGA(); // Google betiği ancak istatistik izniyle yüklenir (GoogleAnalytics.tsx)
  if (w.__yhGAon && typeof w.gtag === "function") {
    const ad = c.marketing ? "granted" : "denied";
    w.gtag("consent", "update", { analytics_storage: c.stats ? "granted" : "denied", ad_storage: ad, ad_user_data: ad, ad_personalization: ad });
  }
}

export default function MarketingTags({ pixelId }: { pixelId: string | null }) {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    captureAdSource();
    const apply = (c: ConsentChoice) => { updateGa(c); if (c.marketing && pixelId) loadPixel(pixelId); };
    const c = consentChoice();
    if (c) apply(c);
    return onConsent(apply);
  }, [pixelId]);

  // Sayfa geçişlerinde PageView (ilki loadPixel'de)
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const w = window as any;
    if (w.fbq) w.fbq("track", "PageView");
  }, [pathname]);

  return null;
}
