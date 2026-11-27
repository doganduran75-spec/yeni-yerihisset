// AYNI POSTA KUTUSU (güvenlik notu 2026-11-16 (1)): Gmail'de "ad+1@gmail.com", "a.d@gmail.com" ve "ad@googlemail.com" aynı
// kutuya düşer → her biriyle yeni hesap açıp hoş geldin kuponunu çoğaltmak mümkündü. Karşılaştırma için tek biçim:
// küçük harf, "+..." eki atılır; Gmail'de noktalar da atılır ve googlemail.com → gmail.com. (Saf; test: 24-pano dışı, 25-kucuk-guvenlik)
export function mailboxKey(email: string | null | undefined): string {
  const e = String(email || "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return e;
  let local = e.slice(0, at).split("+")[0];
  let domain = e.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}
