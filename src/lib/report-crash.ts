// SAYFA ÇÖKMESİ (kullanıcı 2026-11-15, canlıya geçiş): error.tsx / global-error.tsx müşteriye "bir şeyler ters gitti"
// gösterdiğinde bunu /api/client-error'a "crash" olarak yaz → panoda "Hata alan müşteriler" + Telegram "Site hatası".
// Supabase istemcisine DOKUNMAZ (çökme oradan da gelmiş olabilir). Aynı hata aynı sekmede bir kez. Asla hata fırlatmaz.
// Not: canlıda sunucu bileşeni hatasının metni gizlenir (yalnız "iz" / digest gelir) — asıl metin sunucu tarafında
// src/instrumentation.ts ile aynı tabloya düşer.
const sent = new Set<string>();

export function reportCrash(error: { message?: string; digest?: string } | null | undefined, where: "page" | "root") {
  try {
    const msg = `${where === "root" ? "Site tamamen çöktü" : "Sayfa çöktü"}: ${String(error?.message || "bilinmeyen hata").replace(/\s+/g, " ").slice(0, 200)}${error?.digest ? ` (iz ${error.digest})` : ""}`;
    if (sent.has(msg)) return;
    sent.add(msg);
    void fetch("/api/client-error", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "crash", message: msg, path: window.location.pathname }),
    }).catch(() => { /* kayıt kritik değil */ });
  } catch { /* kayıt kritik değil */ }
}
