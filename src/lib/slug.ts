// Sayfa adresi (URL "slug") üretimi — Türkçe harfler SİLİNMEZ, karşılığına çevrilir:
// "Doğru İş İçin Doğru Araç" → "dogru-is-icin-dogru-arac" (eskiden "doru-i-iin-doru-ara").
const TR_MAP: Record<string, string> = {
  ğ: "g", Ğ: "g", ü: "u", Ü: "u", ş: "s", Ş: "s", ı: "i", İ: "i", I: "i",
  ö: "o", Ö: "o", ç: "c", Ç: "c", â: "a", Â: "a", î: "i", Î: "i", û: "u", Û: "u",
};

export function toSlug(text: string): string {
  return String(text ?? "")
    .replace(/[ğĞüÜşŞıİIöÖçÇâÂîÎûÛ]/g, (ch) => TR_MAP[ch] ?? ch)
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "") // kalan aksanlar (é → e)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90)
    .replace(/-+$/g, "");
}
