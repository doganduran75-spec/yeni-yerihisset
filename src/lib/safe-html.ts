// Yönetici panelinde yazılan zengin metni (ürün açıklaması, marka hakkında) sayfada göstermeden önce
// tehlikeli parçaları ayıklar: script / style / iframe / object / embed / form öğeleri (içerikleriyle), on* olay
// öznitelikleri, javascript: / data: (görsel dışı) bağlantıları. Yalnız yöneticiler yazar; bu ikinci bir emniyet katmanı.
const BLOCK = "script|style|iframe|object|embed|form|textarea|select|noscript|template|svg|math";
const SINGLE = BLOCK + "|input|button|link|meta|base|frame|frameset";

export function safeHtml(html: string | null | undefined): string {
  return String(html || "")
    .replace(new RegExp(`<\\s*(${BLOCK})\\b[\\s\\S]*?<\\s*\\/\\s*\\1\\s*>`, "gi"), "")
    .replace(new RegExp(`<\\s*\\/?\\s*(${SINGLE})\\b[^>]*>`, "gi"), "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src|xlink:href|formaction)\s*=\s*("|')\s*(javascript:|vbscript:|data:(?!image\/(png|jpe?g|webp|gif);))[^"']*\2/gi, "");
}

/** Düz metin mi (eski açıklamalar)? HTML etiketi yoksa düz metin sayılır. */
export const isPlainText = (s: string | null | undefined) => !/<\/?[a-z][\s\S]*?>/i.test(String(s || ""));

/** Düz metni editöre uygun HTML'e çevir: boş satır → paragraf, tek satır sonu → <br> */
export function plainToHtml(s: string): string {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return String(s || "").trim().split(/\n\s*\n/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
}
