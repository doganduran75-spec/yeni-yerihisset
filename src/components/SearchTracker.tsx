"use client";

import { useEffect } from "react";
import { trackSearch } from "@/lib/analytics";

/**
 * /ara sunucu sayfasından çağrılır; arama terimini + sonuç sayısını analitiğe
 * yazar (0 sonuç = talep/stok açığı sinyali → admin "sonuçsuz aramalar" raporu).
 */
export default function SearchTracker({ term, count }: { term: string; count: number }) {
  useEffect(() => {
    const t = term.trim();
    if (t) trackSearch(t, count);
  }, [term, count]);
  return null;
}
