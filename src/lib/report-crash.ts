// SAYFA ÇÖKMESİ (kullanıcı 2026-11-15, canlıya geçiş): error.tsx / global-error.tsx müşteriye "bir şeyler ters gitti"
// gösterdiğinde bunu /api/client-error'a "crash" olarak yaz → panoda "Hata alan müşteriler" + Telegram "Site hatası".
// Supabase istemcisine DOKUNMAZ (çökme oradan da gelmiş olabilir). Aynı hata aynı sekmede bir kez. Asla hata fırlatmaz.
// Not: canlıda sunucu bileşeni hatasının metni gizlenir (yalnız "iz" / digest gelir) — asıl metin sunucu tarafında
// src/instrumentation.ts ile aynı tabloya düşer.
const sent = new Set<string>();

// DEPLOY SONRASI ESKİ SAYFA (kullanıcı 2026-11-18: "Failed to load chunk … from module …"): deploy'dan önce açılmış sekme,
// yeni sürümde artık olmayan bir parçayı (chunk) ister → sayfa çöker. Bu bir hata değil, sayfanın eskimesi: bir kez
// kendiliğinden yenilenir (yeni sürüm gelir), çökme olarak kaydedilmez. 60 sn içinde yeniden olursa döngüye girmesin diye
// normal çökme gibi davranılır (gerçekten eksik bir dosya varsa görünür). Asıl önlem: deploy.sh NEXT_DEPLOYMENT_ID —
// sürüm farkında gezinme zaten tam sayfa yenilemeye döner; bu, ondan kaçanlar için.
const STALE_RE = /Failed to load chunk|ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
export function isStaleBuildError(error: { message?: string; name?: string } | null | undefined): boolean {
  return STALE_RE.test(`${error?.name || ""} ${error?.message || ""}`);
}
export function reloadIfStaleBuild(error: { message?: string; name?: string } | null | undefined): boolean {
  try {
    if (!isStaleBuildError(error)) return false;
    const KEY = "yh-stale-reload";
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 60_000) return false; // az önce yenilendi → döngü olmasın, çökme olarak kaydet
    sessionStorage.setItem(KEY, String(Date.now()));
    window.location.reload();
    return true;
  } catch { return false; }
}

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
