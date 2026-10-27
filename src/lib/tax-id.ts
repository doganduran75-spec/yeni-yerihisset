// Vergi kimlik numaraları (fatura): VKN 10 hane (şirket), TCKN 11 hane (şahıs / şahıs şirketi).
// Şahıs şirketi sahibi faturayı TCKN'si + vergi dairesiyle ister; bireysel müşteri vermezse 11111111111 kullanılır.
// TCKN doğrulama (nüfus algoritması): yazım hatası faturayı GİB'de reddettirmesin.
export function isValidTckn(raw: string | null | undefined): boolean {
  const s = String(raw || "").replace(/\D/g, "");
  if (!/^[1-9]\d{10}$/.test(s) || s === "11111111111") return false;
  const d = s.split("").map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  if (((odd * 7 - even) % 10 + 10) % 10 !== d[9]) return false;
  return d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
}

/** "VKN" (10) / "TCKN" (11) — ekranda doğru adla göstermek için */
export const taxIdLabel = (v: string | null | undefined) => (String(v || "").replace(/\D/g, "").length === 11 ? "TCKN" : "VKN");
