// ÖDEME BEKLEYEN HAVALE SİPARİŞİ E-POSTASI (kullanıcı 2026-11-12) — saf yardımcılar (import yok; regresyon Node'da doğrudan yükler).
// "Siparişiniz başarıyla oluşturuldu!" ödeme alınmış gibi okunuyordu → başlık + konu "ödemeni bekliyoruz", en üstte adımlar
// ve ödeme kutusu, "hazırlanmaya başlanacaktır" türü cümleler "ödemen ulaşınca" olur. Kullanım: src/lib/notifications.ts

/** E-posta uyumlu adım çubuğu: tamamlananlar ✓ yeşil, şu anki ● turuncu, sonrakiler ○ gri */
export function orderStepsHtml(steps: string[], current: number): string {
  const cell = (label: string, i: number) => {
    const st = i < current ? { mark: "✓", c: "#4d7c0f", w: 700 } : i === current ? { mark: "●", c: "#b45309", w: 800 } : { mark: "○", c: "#9ca3af", w: 500 };
    return `<td style="text-align:center;padding:4px 2px;vertical-align:top;width:${Math.floor(100 / steps.length)}%">
      <div style="font-size:16px;line-height:1;color:${st.c}">${st.mark}</div>
      <div style="font-size:11px;line-height:1.3;margin-top:4px;color:${st.c};font-weight:${st.w}">${label}</div></td>`;
  };
  return `<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 16px 0"><tr>${steps.map(cell).join("")}</tr></table>`;
}

const PENDING_TITLE = "Siparişin oluşturuldu — ödemeni bekliyoruz";
// Ödeme yapılmış izlenimi veren cümle (şablon panelden düzenlenmiş olabilir; yalnız bu kalıplar değişir)
const PREPARE_SENTENCE = /[^.!<>]*(hazırlanmaya başlan|en kısa sürede hazırlan)[^.!<>]*[.!]/i;
const MARK = "\u0000HAVALE_TOP\u0000";

/** Şablondan çıkan konu + gövdeyi ödeme bekleyen havaleye çevirir. Ödeme kutusu selamlama paragrafından sonra
 *  ("hazırlanmaya başlanacaktır" cümlesinin paragrafı); o cümle yoksa başlığın hemen altına girer. */
export function applyHavalePending(_subject: string, bodyHtml: string, topHtml: string, shortId: string) {
  const subject = `Siparişin oluşturuldu, ödemeni bekliyoruz ⏳ — ${shortId}`;
  let body = String(bodyHtml || "");
  const hasSentence = PREPARE_SENTENCE.test(body);
  if (hasSentence) {
    body = body.replace(PREPARE_SENTENCE, `Siparişini aldık; ödemen ulaşınca hazırlamaya başlayacağız.${MARK}`);
    body = body.replace(new RegExp(`${MARK}([\\s\\S]*?</p>)`), (_m, rest) => `${rest}${topHtml}`).split(MARK).join("");
    body = body.replace(new RegExp(PREPARE_SENTENCE.source, "gi"), ""); // aynı türden başka cümle kalmasın
  }
  if (!body.includes(topHtml)) body = body.replace(/(<\/h[1-3]>)/i, `$1${topHtml}`);
  const h = /<h([1-3])\b([^>]*)>[\s\S]*?<\/h\1>/i;
  body = h.test(body)
    ? body.replace(h, (_m, n, attrs) => `<h${n}${attrs}>${PENDING_TITLE}</h${n}>`)
    : `<h2 style="font-size:22px;font-weight:800;margin:0 0 12px">${PENDING_TITLE}</h2>${body.includes(topHtml) ? "" : topHtml}${body}`;
  return { subject, bodyHtml: body };
}
