/**
 * Çerez onayı (KVKK) — tek kaynak. CookieBanner seçimi localStorage'a yazar ve
 * "yh:consent" olayı yayar; pazarlama/analitik etiketleri (Meta Pixel, GA) buna göre açılır.
 * Onay yokken: Meta Pixel HİÇ yüklenmez, GA çerezsiz (consent mode "denied") çalışır.
 */
export const CONSENT_KEY = "yh:cookie-consent"; // "accepted" | "rejected"
export const CONSENT_EVENT = "yh:consent";

export function consentState(): "accepted" | "rejected" | null {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "accepted" || v === "rejected" ? v : null;
  } catch {
    return null;
  }
}

export const hasMarketingConsent = () => consentState() === "accepted";

export function setConsent(value: "accepted" | "rejected") {
  try { window.localStorage.setItem(CONSENT_KEY, value); } catch { /* özel mod */ }
  try { window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value })); } catch { /* yut */ }
}

export function onConsent(cb: (value: "accepted" | "rejected") => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent).detail);
  window.addEventListener(CONSENT_EVENT, h);
  return () => window.removeEventListener(CONSENT_EVENT, h);
}
