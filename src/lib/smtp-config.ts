/**
 * SMTP konfigürasyon yardımcısı.
 *
 * Port/secure uyumsuzluğunu otomatik düzeltir:
 *   Port 465  → secure: true  (SSL/TLS)
 *   Port 587  → secure: false + requireTLS: true  (STARTTLS)
 *   Port 25   → secure: false  (düz SMTP)
 *
 * Kullanıcının "SSL kullan" kutucuğu yanlış ayarlanmışsa port'a göre override edilir.
 */
export function buildSmtpConfig(settings: {
  smtp_host: string;
  smtp_port?: number | null;
  smtp_secure?: boolean | null;
  smtp_user?: string | null;
  smtp_password?: string | null;
}) {
  const host = settings.smtp_host ?? "";
  const port = Number(settings.smtp_port) || 587;

  // Port'a göre doğru secure değerini belirle — kullanıcı ayarını override et
  const secure = port === 465;

  // 587 ve 25'te STARTTLS zorunlu kılınır
  const requireTLS = !secure && port !== 25;

  return {
    host,
    port,
    secure,
    ...(requireTLS ? { requireTLS: true } : {}),
    auth: {
      user: settings.smtp_user ?? "",
      pass: settings.smtp_password ?? "",
    },
    tls: {
      // Self-signed sertifikalara izin ver (shared hosting yaygın)
      rejectUnauthorized: false,
    },
  } as const;
}
