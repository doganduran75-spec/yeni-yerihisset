"use client"; // Hata sınırları Client Component olmalı

/**
 * Kök layout dahil her şey çökerse bu sayfa devreye girer.
 * Kendi <html>/<body>'sini içermeli ve global CSS'e güvenmemeli —
 * bu yüzden stiller satır içi (inline) verildi.
 */
export default function GlobalError({
  error,
  unstable_retry,
  reset,
}: {
  error: Error & { digest?: string };
  unstable_retry?: () => void;
  reset?: () => void;
}) {
  const retry = () => (unstable_retry ?? reset)?.();

  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.25rem",
          padding: "1.5rem",
          textAlign: "center",
          backgroundColor: "#fafaf5",
          color: "#1a1c19",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: 0 }}>
          Site geçici olarak kullanılamıyor
        </h1>
        <p style={{ color: "#46483c", maxWidth: "28rem", margin: 0 }}>
          Beklenmeyen bir hata oluştu. Ekibimiz bilgilendirildi. Lütfen birkaç
          dakika sonra tekrar deneyin.
        </p>
        <button
          onClick={retry}
          style={{
            border: "none",
            cursor: "pointer",
            padding: "0.75rem 1.5rem",
            backgroundColor: "#536430",
            color: "#ffffff",
            borderRadius: "0.75rem",
            fontWeight: 700,
            fontSize: "0.875rem",
          }}
        >
          Tekrar Dene
        </button>
        {error?.digest && (
          <p style={{ fontSize: "0.75rem", color: "#b2b5a8", margin: 0 }}>
            Hata kodu: {error.digest}
          </p>
        )}
      </body>
    </html>
  );
}
