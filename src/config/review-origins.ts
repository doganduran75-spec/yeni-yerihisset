// Elle eklenen yorumun KAYNAĞI (kullanıcı 2026-11-19: "instagrama gelen yorum, trendyol müşterisi yorumu gibi").
// order_reviews.origin'e kod yazılır; ürün sayfasında adın yanında etiket (boşsa etiket yok). MIG 20261196.
export const REVIEW_ORIGINS = {
  eski_site: { label: "Eski site", badge: "Eski sitemizden" },
  instagram: { label: "Instagram", badge: "Instagram'dan" },
  trendyol: { label: "Trendyol", badge: "Trendyol müşterisi" },
  hepsiburada: { label: "Hepsiburada", badge: "Hepsiburada müşterisi" },
  amazon: { label: "Amazon", badge: "Amazon müşterisi" },
  whatsapp: { label: "WhatsApp", badge: "WhatsApp'tan" },
  diger: { label: "Diğer (etiket gösterme)", badge: "" },
} as const;

export type ReviewOrigin = keyof typeof REVIEW_ORIGINS;

export function reviewOriginBadge(origin?: string | null): string {
  return (origin && (REVIEW_ORIGINS as Record<string, { badge: string }>)[origin]?.badge) || "";
}
