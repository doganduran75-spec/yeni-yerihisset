// KUPON KODU (kullanıcı kararı 2026-10-25): kodlar TAHMİN EDİLEMEZ — sistem üretir, elle yazılmaz.
// Biçim YH-XXXX-XXXX, karışmayan 32 karakter (0/O, 1/I yok) → 32^8 ≈ 1,1×10¹² olasılık (256 % 32 = 0 → eşit dağılım). Müşteri kod yazmadığı
// için kod yalnız iç kimliktir; kupona müşteri hesabına tanımlanarak ya da kampanya bağlantısıyla (ad, kod değil) ulaşır.
// Tarayıcıda ve sunucuda çalışır (Web Crypto).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".replace(/[OI]/g, "");

export function generateCouponCode(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  const s = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `YH-${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Sistemin ürettiği (tahmin edilemez) biçim mi? Değilse panelde "Kodu yenile" önerilir. */
export function isSystemCouponCode(code: string | null | undefined): boolean {
  const c = String(code || "");
  return /^YH-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c)   // yeni biçim
    || /^GERI[A-Z2-9]{6}$/.test(c)                  // seni özledik (eski üretici)
    || /^K[0-9A-F]{8}$/.test(c)                     // CRM kampanyası (eski üretici)
    || /^RGT/.test(c);                              // regresyon test kuponları
}
