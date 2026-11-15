// SUNUCU HATALARI (kullanıcı 2026-11-15, canlıya geçiş): Next'in yakaladığı her sunucu hatası (sayfa çizimi, API ucu,
// server action) client_errors'a "server" olarak yazılır → panoda "Hata alan müşteriler" + Telegram "Site hatası".
// Önceden yalnız pm2 kaydında kalıyordu. Kişisel veri yok: adresin sorgu kısmı (?…) atılır.
// Aynı yer + aynı hata dakikada bir kez yazılır (bot saldırısında tablo şişmesin). Yönlendirme / 404 hata sayılmaz.
// Belge: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md
import type { Instrumentation } from "next";

const recent = new Map<string, number>();

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const e = err as { message?: unknown; digest?: unknown } | null;
    const digest = e && typeof e === "object" && "digest" in e ? String(e.digest) : "";
    if (/^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/.test(digest) || digest === "DYNAMIC_SERVER_USAGE") return;
    const message = String(err instanceof Error ? err.message : err).replace(/\s+/g, " ").slice(0, 220);
    const path = String(request?.path || "").split("?")[0].slice(0, 120);
    const where = context?.routePath || path;
    const key = `${where}|${message}`;
    const now = Date.now();
    if ((recent.get(key) ?? 0) > now - 60_000) return;
    recent.set(key, now);
    if (recent.size > 500) recent.clear();
    const kind = context?.routeType === "route" ? "API" : context?.routeType === "action" ? "İşlem" : "Sayfa";
    const { createAdminClient } = await import("@/lib/supabase-admin");
    await (createAdminClient() as any).from("client_errors").insert({
      kind: "server",
      message: `${kind} ${request?.method || ""} ${where}: ${message}`.replace(/\s+/g, " ").slice(0, 300),
      path,
    });
  } catch { /* kayıt kritik değil — asla isteği bozmaz */ }
};
