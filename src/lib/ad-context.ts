/**
 * Reklam kaynağı (attribution) — tarayıcı tarafı.
 * Ziyaretçi bir reklam/kampanya bağlantısıyla geldiğinde (utm_*, fbclid, gclid) bunu 30 gün
 * saklar (son tıklama kazanır). Sipariş verilirken getAdContext() siparişe eklenir:
 *  - source: admin sipariş detayında "Instagram reklamı · kampanya" olarak görünür
 *  - meta: Conversions API için (_fbp/_fbc çerezleri, sayfa adresi) — YALNIZ çerez onayı varsa
 */
import { hasMarketingConsent } from "./consent";

const KEY = "yh:adsrc";
const TTL = 30 * 24 * 3600 * 1000;

export type AdSource = {
  utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string; utm_term?: string;
  fbclid?: string; gclid?: string; landing?: string; ts: number;
};

/** Sayfa açılışında bir kez: URL'de kampanya parametresi varsa sakla */
export function captureAdSource() {
  try {
    const p = new URLSearchParams(window.location.search);
    const pick = (k: string) => (p.get(k) || "").slice(0, 150) || undefined;
    const src: AdSource = {
      utm_source: pick("utm_source"), utm_medium: pick("utm_medium"), utm_campaign: pick("utm_campaign"),
      utm_content: pick("utm_content"), utm_term: pick("utm_term"),
      fbclid: pick("fbclid"), gclid: pick("gclid"),
      landing: window.location.pathname.slice(0, 200), ts: Date.now(),
    };
    if (!src.utm_source && !src.fbclid && !src.gclid) return;
    window.localStorage.setItem(KEY, JSON.stringify(src));
  } catch { /* takip kritik değil */ }
}

function readSource(): AdSource | null {
  try {
    const s = JSON.parse(window.localStorage.getItem(KEY) || "null") as AdSource | null;
    if (!s || Date.now() - s.ts > TTL) return null;
    return s;
  } catch {
    return null;
  }
}

const cookie = (name: string) => {
  try { return decodeURIComponent(document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`))?.[1] || "") || undefined; }
  catch { return undefined; }
};

/** Sipariş isteğine eklenen bağlam (sunucu: src/lib/meta-capi.ts › readAdContext) */
export function getAdContext() {
  const src = readSource();
  const consent = hasMarketingConsent();
  // _fbc: Pixel reklam tıklamasından yazar; onay sonradan verildiyse saklanan fbclid'den kurulur
  const fbc = cookie("_fbc") || (src?.fbclid ? `fb.1.${src.ts}.${src.fbclid}` : undefined);
  return {
    consent,
    source: src ? { ...src, fbclid: src.fbclid ? "1" : undefined, gclid: src.gclid ? "1" : undefined } : null,
    meta: consent ? { fbp: cookie("_fbp"), fbc, url: window.location.origin + window.location.pathname } : null,
  };
}
