// Cron uçlarının ortak şifre kontrolü (güvenlik notu 2026-11-16 (6)): düz "!==" karşılaştırması süre farkıyla tahmin
// edilebilir → sabit süreli karşılaştırma. Yalnız başlık (x-cron-secret): adres satırındaki anahtar erişim loglarına düşer.
import { timingSafeEqual } from "node:crypto";

export function cronSecretOk(provided: string | null | undefined): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !provided) return false;
  const a = Buffer.from(provided), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
