// Yorum görseli yükleme kuralları (güvenlik 2026-11-16, MIG 20261191). Yükleme yalnız sunucudan: /api/review-images.
// Üye depoya (product-images/reviews/<id>/) doğrudan yazamaz; order_reviews kuralı en çok 5 görsel ve yalnız bu
// klasörden adres kabul eder. Kullanım: src/app/api/review-images/route.ts, Hesabım › Yorum yap (src/app/account/page.tsx).

export const REVIEW_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // görsel başına 5 MB
export const REVIEW_IMAGES_PER_REVIEW = 5;             // yorum başına (veritabanı kuralı da aynı)
export const REVIEW_IMAGES_PER_DAY = 20;               // üye başına son 24 saatte

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif" };

/** Dosyanın İLK BAYTLARINA bakarak gerçek görsel türü (tarayıcının söylediği türe güvenilmez). Görsel değilse null. */
export function sniffImageType(b: Uint8Array): { mime: string; ext: string } | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  const ascii = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  let mime: string | null = null;
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) mime = "image/jpeg";
  else if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) mime = "image/png";
  else if (b.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) mime = "image/gif";
  else if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") mime = "image/webp";
  else if (b.length >= 16 && ascii(4, 4) === "ftyp" && /avi[fs]/.test(ascii(8, 24))) mime = "image/avif";
  return mime ? { mime, ext: EXT[mime] } : null;
}
