import type { NextRequest } from "next/server";

// Basit IP bazlı istek sınırı (sabit pencere). Herkese açık, e-posta gönderen /
// kayıt açan uçları toplu kötüye kullanıma (e-posta bombardımanı, sahte kayıt,
// e-posta tarama) karşı korur.
// NOT: Sayaç pm2 instance başına bellekte tutulur (4 instance → pratik sınır en
// fazla 4 katı). Daha sıkı/ortak sınır gerekirse Caddy rate_limit veya Redis.

type Bucket = { n: number; reset: number };
const stores = new Map<string, Map<string, Bucket>>();

export function clientIp(req: NextRequest): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim()
    || req.headers.get("x-real-ip")
    || "unknown";
}

/**
 * true → sınır AŞILDI (isteği reddet).
 * @param name   uç adı (her uç kendi sayacını tutar)
 * @param key    genelde IP (istenirse IP+e-posta)
 * @param max    pencere başına izin verilen istek
 * @param windowMs pencere süresi
 */
export function rateLimited(name: string, key: string, max: number, windowMs: number): boolean {
  let store = stores.get(name);
  if (!store) { store = new Map(); stores.set(name, store); }
  const now = Date.now();
  const b = store.get(key);
  if (!b || b.reset < now) {
    store.set(key, { n: 1, reset: now + windowMs });
    if (store.size > 5000) for (const [k, v] of store) if (v.reset < now) store.delete(k);
    return false;
  }
  b.n++;
  return b.n > max;
}

export const TOO_MANY = { error: "Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin." };
