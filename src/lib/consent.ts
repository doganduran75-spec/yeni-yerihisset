/**
 * Çerez onayı (KVKK) — tek kaynak. Kategoriler: zorunlu (her zaman) · istatistik · pazarlama.
 * CookieBanner seçimi localStorage'a yazar ve "yh:consent" olayı yayar:
 *  - istatistik → kendi ziyaret kaydımız (src/lib/track.ts) tam kayıt + Google Analytics çerezleri
 *  - pazarlama  → Meta Pixel + reklam eşleştirmesi (src/components/MarketingTags.tsx, src/lib/ad-context.ts)
 * Saklama biçimi (geriye uyumlu): "accepted" (hepsi) · "rejected" (hiçbiri) · "s1m0" gibi kısmi seçim.
 * Seçim yokken davranış Ayarlar › Çerez onayı'na bağlı (deneme modu / KVKK modu — /api/track).
 */
export const CONSENT_KEY = "yh:cookie-consent";
export const CONSENT_EVENT = "yh:consent";

export type ConsentChoice = { stats: boolean; marketing: boolean };

function read(): ConsentChoice | null {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    if (v === "accepted") return { stats: true, marketing: true };
    if (v === "rejected") return { stats: false, marketing: false };
    const m = /^s([01])m([01])$/.exec(v || "");
    return m ? { stats: m[1] === "1", marketing: m[2] === "1" } : null;
  } catch {
    return null;
  }
}

/** null = ziyaretçi henüz seçim yapmadı */
export function consentChoice(): ConsentChoice | null {
  return read();
}

/** Kategori izni: true / false · null = seçim yapılmadı */
export function consentFor(cat: "stats" | "marketing"): boolean | null {
  const c = read();
  return c ? c[cat] : null;
}

export function consentState(): "accepted" | "rejected" | "custom" | null {
  const c = read();
  if (!c) return null;
  return c.stats && c.marketing ? "accepted" : !c.stats && !c.marketing ? "rejected" : "custom";
}

export const hasMarketingConsent = () => consentFor("marketing") === true;

export function setConsent(choice: ConsentChoice) {
  const v = choice.stats && choice.marketing ? "accepted" : !choice.stats && !choice.marketing ? "rejected" : `s${choice.stats ? 1 : 0}m${choice.marketing ? 1 : 0}`;
  try { window.localStorage.setItem(CONSENT_KEY, v); } catch { /* özel mod */ }
  try { window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: choice })); } catch { /* yut */ }
}

// "Çerez tercihlerini değiştir" (alt bilgi / Çerez Politikası) → onay penceresini yeniden aç (KVKK: rıza
// verildiği kadar kolay geri alınabilmeli)
export const CONSENT_OPEN_EVENT = "yh:consent-open";
export function openConsentPreferences() {
  try { window.dispatchEvent(new Event(CONSENT_OPEN_EVENT)); } catch { /* yut */ }
}

export function onConsent(cb: (choice: ConsentChoice) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent).detail);
  window.addEventListener(CONSENT_EVENT, h);
  return () => window.removeEventListener(CONSENT_EVENT, h);
}
