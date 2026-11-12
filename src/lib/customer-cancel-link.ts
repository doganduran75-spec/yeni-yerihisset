// Müşteri iptal sayfasının imzalı bağlantısı (/siparis-iptal?r=…) — e-postalara konur, giriş gerekmez.
// Ayrı dosya: notifications.ts ağır iptal kodunu (iyzico, pazaryeri senkronu) içe almasın.
import { createHmac, timingSafeEqual } from "node:crypto";

const key = () => `order-cancel:${process.env.SUPABASE_SERVICE_ROLE_KEY || ""}`;
const sig = (orderId: string) => createHmac("sha256", key()).update(orderId).digest("base64url").slice(0, 32);
export const cancelToken = (orderId: string) => `${orderId}.${sig(orderId)}`;
export function verifyCancelToken(token: string): string | null {
  const m = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{32})$/i.exec(String(token || ""));
  if (!m) return null;
  const a = Buffer.from(sig(m[1])), b = Buffer.from(m[2]);
  return a.length === b.length && timingSafeEqual(a, b) ? m[1] : null;
}
export function cancelUrl(orderId: string) {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com").replace(/\/$/, "");
  return `${site}/siparis-iptal?r=${cancelToken(orderId)}`;
}

