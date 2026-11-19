// ÜRÜN AÇIKLAMASINDA "SIK SORULAN SORULAR" (kullanıcı 2026-11-19: açıklama kısa ve okunur olsun, merak eden ayrıntıyı
// bulsun). Açıklama panel editöründe (TipTap) sade biçimde yazılır — editör <details> tutmaz:
//   <h3>Sık sorulan sorular</h3>
//   <p><strong>Soru?</strong><br>Cevap</p>
// Sitede bu paragraflar açılır-kapanır soruya döner (faqAccordion), ayrıca FAQPage yapısal verisi olarak basılır
// (extractFaq) — yapay zekâ ve arama motorları soru-cevabı doğrudan okur. Başlık yoksa açıklamaya dokunulmaz.

const HEAD_RE = /<h([23])[^>]*>\s*S[ıi]k(?:ça)? sorulan sorular\s*<\/h\1>/i;
const QA_RE = /<p[^>]*>\s*<strong>([\s\S]*?)<\/strong>\s*<br\s*\/?>\s*([\s\S]*?)<\/p>/gi;

/** Başlıktan sonraki bölüm (bir sonraki h1–h3'e ya da sona kadar) */
function faqBlock(html: string): { start: number; end: number } | null {
  const m = HEAD_RE.exec(html);
  if (!m) return null;
  const start = m.index + m[0].length;
  const rest = html.slice(start);
  const next = rest.search(/<h[1-3][\s>]/i);
  return { start, end: next < 0 ? html.length : start + next };
}

const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

export function extractFaq(html: string | null | undefined): { q: string; a: string }[] {
  const s = String(html || "");
  const b = faqBlock(s);
  if (!b) return [];
  const out: { q: string; a: string }[] = [];
  for (const m of s.slice(b.start, b.end).matchAll(QA_RE)) {
    const q = text(m[1]), a = text(m[2]);
    if (q && a) out.push({ q, a });
  }
  return out;
}

export function faqAccordion(html: string): string {
  const b = faqBlock(html);
  if (!b) return html;
  const block = html.slice(b.start, b.end).replace(QA_RE,
    (_m, q: string, a: string) => `<details class="faq-item"><summary>${q.trim()}</summary><p>${a.trim()}</p></details>`);
  return html.slice(0, b.start) + block + html.slice(b.end);
}
