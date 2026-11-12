// E-POSTA YAZIM ÖNERİSİ (kullanıcı 2026-11-12) — import yok; regresyon Node'da doğrudan yükler.
// Misafir siparişte yanlış yazılan e-posta (gmial.com, hotmal.com, gmail.con) sipariş, fatura ve hesap bağlantısını
// yabancıya gönderir → ödeme sayfası "… mı demek istediniz?" önerir (engellemez).
const DOMAINS = [
  "gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com", "yandex.com", "live.com", "msn.com",
  "hotmail.com.tr", "outlook.com.tr", "windowslive.com", "mynet.com", "me.com", "proton.me", "protonmail.com",
  "ymail.com", "aol.com", "gmx.com", "gmx.de", "gmx.net", "mail.com", "web.de", "yandex.com.tr", "hotmail.de", "googlemail.com", "mail.ru", "yandex.ru",
];

function dist(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); // yer değiştirme
  }
  return d[m][n];
}

/** Olası doğru e-posta (yazım hatası varsa) ya da null */
export function suggestEmail(raw: string): string | null {
  const e = String(raw || "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1 || at === e.length - 1) return null;
  const user = e.slice(0, at);
  let domain = e.slice(at + 1).replace(/\.+$/, "");
  // Sık uzantı hataları: .con .cmo .co (gmail.co) .om
  domain = domain.replace(/\.(con|cmo|cm|om|comm|vom|xom)$/, ".com").replace(/\.com\.(tt|t)$/, ".com.tr");
  if (DOMAINS.includes(domain)) return domain === e.slice(at + 1) ? null : `${user}@${domain}`;
  let best: string | null = null, bestD = 3;
  for (const d of DOMAINS) {
    const x = dist(domain, d);
    if (x < bestD) { best = d; bestD = x; }
  }
  // Kısa alan adlarında 1, uzunlarda 2 harf farkına kadar öner
  if (best && bestD <= (domain.length <= 8 ? 1 : 2)) return `${user}@${best}`;
  return null;
}
