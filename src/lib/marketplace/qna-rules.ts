// PAZARYERİ SORU-CEVAP kuralları (kullanıcı 2026-11-14) — import yok; regresyon Node'da doğrudan yükler.
// Trendyol: cevap 10–2000 karakter; yasaklı içerikli cevap reddedilir, sınır aşılırsa soru "cevaplanamaz" olur.
// Telefon / e-posta / bağlantı / siteye ya da sosyal medyaya yönlendirme pazaryeri kurallarına aykırı → gönderimden önce uyar.
export const ANSWER_MIN = 10;
export const ANSWER_MAX = 2000;

export const QNA_STATUS_LABEL: Record<string, string> = {
  WAITING_FOR_ANSWER: "Cevap bekliyor",
  WAITING_FOR_APPROVE: "Cevap Trendyol onayında",
  ANSWERED: "Cevaplandı",
  REPORTED: "Bildirildi",
  REJECTED: "Reddedildi",
  UNANSWERED: "Süresi doldu",
};

/** Cevap gönderilebilir mi? errors → gönderilmez; warnings → yönetici onaylarsa gönderilir */
export function answerProblems(raw: string): { errors: string[]; warnings: string[] } {
  const t = String(raw || "").trim();
  const errors: string[] = [], warnings: string[] = [];
  if (t.length < ANSWER_MIN) errors.push(`Cevap en az ${ANSWER_MIN} karakter olmalı.`);
  if (t.length > ANSWER_MAX) errors.push(`Cevap en çok ${ANSWER_MAX} karakter olabilir (${t.length}).`);
  if (/(\+?90[\s-]?)?\(?0?5\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/.test(t) || /\d{10,}/.test(t.replace(/[\s-]/g, "")))
    warnings.push("Telefon numarası var — pazaryeri kişisel bilgi / iletişim paylaşımını reddeder.");
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(t)) warnings.push("E-posta adresi var — pazaryeri reddeder.");
  if (/(https?:\/\/|www\.|\.com\b|\.com\.tr\b|\.net\b)/i.test(t)) warnings.push("Bağlantı / site adresi var — pazaryeri dışına yönlendirme reddedilir.");
  if (/(whats ?app|instagram|telegram|dm\b|sitemiz|web ?site)/i.test(t)) warnings.push("Pazaryeri dışına yönlendirme (WhatsApp, Instagram, site…) — reddedilebilir.");
  return { errors, warnings };
}
