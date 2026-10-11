"use client";

import { openConsentPreferences } from "@/lib/consent";

// Çerez onay penceresini yeniden açar (alt bilgi + Çerez Politikası). Onay, verildiği kadar kolay geri alınabilmeli.
export default function CookiePreferencesLink({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <button type="button" onClick={openConsentPreferences} className={className ?? "text-olive-700 font-bold underline"}>
      {children ?? "Çerez tercihlerini değiştir"}
    </button>
  );
}
