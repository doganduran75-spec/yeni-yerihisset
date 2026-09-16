"use client";

import { useEffect } from "react";

// Satış ortaklığı takibinin İLK halkası: ?ref=KOD ile gelen ziyaretçiyi yakalar.
//  1) affiliate_ref çerezini yazar (30 gün) — checkout bunu okuyup siparişi
//     ilgili affiliate'e bağlar (komisyon).
//  2) /api/affiliate/click çağrısıyla tıklamayı kaydeder (istatistik).
//  3) URL'den ref'i temizler (paylaşımda kod sızmasın, adres temiz kalsın).
// Kök layout'a bir kez mount edilir; yalnız landing'deki ilk URL'yi okur.

const doneCodes = new Set<string>(); // aynı sekmede tekrar tetiklenmesin

export default function AffiliateRefCapture() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("ref");
      if (!code) return;

      // 30 gün geçerli çerez (checkout siparişte okur)
      document.cookie = `affiliate_ref=${encodeURIComponent(code)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;

      // Tıklamayı bir kez kaydet (oturum + sekme bazında koru)
      const guardKey = `yh:affClick:${code}`;
      let already = false;
      try { already = sessionStorage.getItem(guardKey) === "1"; } catch { /* özel mod */ }
      if (!already && !doneCodes.has(code)) {
        doneCodes.add(code);
        try { sessionStorage.setItem(guardKey, "1"); } catch { /* yut */ }
        fetch("/api/affiliate/click", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, path: window.location.pathname }),
          keepalive: true,
        }).catch(() => { /* takip kritik değil */ });
      }

      // URL'den ref'i çıkar; diğer parametreleri koru
      params.delete("ref");
      const qs = params.toString();
      const newUrl = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
      window.history.replaceState(null, "", newUrl);
    } catch {
      /* takip kritik değil, sayfayı bozma */
    }
  }, []);

  return null;
}
