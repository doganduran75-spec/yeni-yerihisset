// PANELDEN YÜKLENEN GÖRSELİ TARAYICIDA KÜÇÜLT (2026-11-23 ölçüm: 1536×2752 ~3 MB .jfif hikâye görselinin ilk hazırlanışı 21 sn).
// En uzun kenar en çok 1600 px, WebP (%85). Ham dosya saklanmaz. Küçültülemezse (HEIC vb. tarayıcı açamıyor) ya da sonuç
// daha büyükse dosya olduğu gibi yüklenir. GIF (hareketli) ve SVG'ye dokunulmaz.
export const SHRINK_MAX_PX = 1600;

export async function shrinkImage(file: File, maxPx = SHRINK_MAX_PX, quality = 0.85): Promise<File> {
  if (typeof window === "undefined" || !/^image\/(jpeg|jpg|png|webp|bmp)$/i.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
    // Zaten küçük ve hafifse dokunma
    if (scale === 1 && file.size <= 400 * 1024) { bmp.close?.(); return file; }
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) { bmp.close?.(); return file; }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/webp", quality));
    if (!blob || blob.type !== "image/webp" || blob.size >= file.size) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "gorsel";
    return new File([blob], `${base}.webp`, { type: "image/webp" });
  } catch {
    return file;
  }
}

/** Yükleme yolu için uzantı (küçültülmüş dosyada webp) */
export function fileExt(file: File, fallback = "jpg"): string {
  return (file.name.split(".").pop() || fallback).toLowerCase().replace(/[^a-z0-9]/g, "") || fallback;
}
