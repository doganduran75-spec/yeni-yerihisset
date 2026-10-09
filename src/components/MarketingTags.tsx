"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { consentState, onConsent } from "@/lib/consent";
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

function grantGa() {
  const w = window as any;
  if (typeof w.gtag === "function") {
    w.gtag("consent", "update", { analytics_storage: "granted", ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted" });
  }
}

export default function MarketingTags({ pixelId }: { pixelId: string | null }) {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    captureAdSource();
    const enable = () => { grantGa(); if (pixelId) loadPixel(pixelId); };
    if (consentState() === "accepted") enable();
    return onConsent((v) => { if (v === "accepted") enable(); });
  }, [pixelId]);

  // Sayfa geçişlerinde PageView (ilki loadPixel'de)
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const w = window as any;
    if (w.fbq) w.fbq("track", "PageView");
  }, [pathname]);

  return null;
}
