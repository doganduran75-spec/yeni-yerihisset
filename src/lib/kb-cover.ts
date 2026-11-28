// BİLGİ BANKASI KAPAK GÖRSELİ (kullanıcı 2026-11-28: "ilk foto yazı tanıtım fotosu oluyor ama alttan üstten kırpılıyor,
// tam ne olduğu anlaşılamıyor; gönderi görseli gibi bir özellik ekleyip nasıl gözükeceğini görebilirim").
// Kapak: seçilen görsel (kb_articles.cover_image) → yoksa içerikteki ilk görsel → yoksa YouTube önizlemesi.
// Görünüm: "cover" = kartı doldurur, dikey konum (cover_pos_y 0 üst … 100 alt) hangi kısmın görüneceğini seçer;
// "contain" = görselin tamamı, boşluklar aynı görselin bulanık hâliyle dolar. Site kartı ile paneldeki önizleme aynı
// bileşeni (src/components/kb/KbCover.tsx) kullanır — panelde görülen sitede görülendir.

export type KbCoverFit = "cover" | "contain";
export type KbCoverInfo = { src: string; fit: KbCoverFit; posY: number } | null;

/** next/image yalnız next.config.ts'teki alan adlarını optimize eder; başka adresten (ör. eski WordPress) gelen görsel 400 verir. */
export function isOptimizable(src: string): boolean {
  if (!src) return false;
  if (src.startsWith("/")) return true;
  try {
    const u = new URL(src);
    return u.protocol === "https:" && (
      (/^supabase\.yerihisset\.com$|^ewnuurgmxhksbjixbian\.supabase\.co$/.test(u.hostname) &&
        u.pathname.startsWith("/storage/v1/object/public/")) ||
      u.hostname === "images.unsplash.com" || u.hostname === "img.youtube.com"
    );
  } catch { return false; }
}

/** İçerikteki görsellerin adresleri (sırasıyla, tekrarsız). */
export function contentImages(html: string | null | undefined): string[] {
  if (!html) return [];
  const out: string[] = [];
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

export function youtubeThumbnail(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null;
}

export function clampPos(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 50;
}

/** Kartta görünecek kapak (yoksa null → süs görseli). */
export function kbCover(a: { cover_image?: string | null; cover_fit?: string | null; cover_pos_y?: number | null; content?: string | null; video_url?: string | null }): KbCoverInfo {
  const fit: KbCoverFit = a.cover_fit === "contain" ? "contain" : "cover";
  const posY = clampPos(a.cover_pos_y ?? 50);
  const chosen = a.cover_image && isOptimizable(a.cover_image) ? a.cover_image : null;
  const first = contentImages(a.content).find(isOptimizable) || null;
  const src = chosen || first || youtubeThumbnail(a.video_url);
  return src ? { src, fit, posY } : null;
}
