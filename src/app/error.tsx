"use client"; // Hata sınırları Client Component olmalı

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, Home, WifiOff, AlertTriangle } from "lucide-react";

export default function Error({
  error,
  unstable_retry,
  reset,
}: {
  error: Error & { digest?: string };
  // Next 16.2+ yeniden dener (veriyi tekrar çeker). Eski sürüm uyumu için reset de kabul.
  unstable_retry?: () => void;
  reset?: () => void;
}) {
  useEffect(() => {
    // Hata raporlama servisine loglanabilir (ör. Sentry) — şimdilik konsola
    console.error("[app/error]", error);
  }, [error]);

  // Supabase/ağ kaynaklı "Failed to fetch" hatalarını ayrı ele al
  const msg = (error?.message || "").toLowerCase();
  const isConnectionError =
    msg.includes("fetch") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("supabase");

  const retry = () => (unstable_retry ?? reset)?.();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 text-center bg-background">
      <div className="flex items-center justify-center w-20 h-20 rounded-full bg-secondary">
        {isConnectionError ? (
          <WifiOff className="text-primary" size={36} />
        ) : (
          <AlertTriangle className="text-primary" size={36} />
        )}
      </div>

      <h1 className="text-2xl sm:text-3xl font-black text-foreground">
        {isConnectionError ? "Bağlantı sorunu" : "Bir şeyler ters gitti"}
      </h1>

      <p className="text-muted-foreground max-w-md">
        {isConnectionError
          ? "Sunucuya şu an ulaşılamıyor. Bu genellikle geçicidir — birkaç saniye sonra tekrar deneyin."
          : "Beklenmeyen bir hata oluştu. Tekrar deneyebilir veya ana sayfaya dönebilirsiniz."}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
        <button
          onClick={retry}
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm btn-juice hover:opacity-90 transition-opacity"
        >
          <RefreshCw size={18} /> Tekrar Dene
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-secondary text-secondary-foreground rounded-xl font-bold text-sm btn-juice hover:opacity-90 transition-opacity"
        >
          <Home size={18} /> Ana Sayfa
        </Link>
      </div>

      {error?.digest && (
        <p className="text-xs text-muted-foreground/60 mt-2">
          Hata kodu: {error.digest}
        </p>
      )}
    </main>
  );
}
