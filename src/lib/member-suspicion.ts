// Eski siteden (WooCommerce) gelen, hiç sipariş vermemiş üyeler için "sahte / bot hesap"
// şüphe puanı. Admin › Üyeler › "Eski site üyelerini incele" ekranı kullanır; karar her
// zaman admin'in (yüksek şüpheli olanlar yalnız ÖN-SEÇİLİ gelir).
//
// Puan: ≥3 yüksek (ön-seçili) · 1–2 orta · ≤0 düşük (gerçek kişi gibi).

export type SuspicionLevel = "high" | "medium" | "low";
export type Suspicion = { score: number; level: SuspicionLevel; reasons: string[] };

// Argo / spam kelimeleri — e-posta ve ad PARÇALARIYLA birebir karşılaştırılır
// (ör. "Işık" adı "sik" içerdiği için işaretlenmez; yalnız tam parça eşleşir).
const BAD_TOKENS = new Set([
  "aq", "amk", "amq", "sik", "siki", "sikis", "sikiş", "sikik", "yarrak", "yarak", "orospu", "pic", "piç",
  "got", "göt", "amcik", "amcık", "gavat", "kahpe", "ibne", "porn", "porno", "sex", "seks", "xxx",
  "casino", "bahis", "betting", "viagra", "crypto", "bitcoin", "loan", "escort", "spam", "test", "asdf", "qwerty",
]);
const DISPOSABLE = /(^|\.)(mailinator|yopmail|guerrillamail|10minutemail|tempmail|temp-mail|trashmail|sharklasers|getnada|dispostable|maildrop|throwawaymail|fakeinbox|mohmal|emailondeck|spamgourmet|mailnesia|mintemail)\./i;
const VOWELS = "aeıioöuüâî";

const tokens = (s: string) => s.toLocaleLowerCase("tr-TR").split(/[^a-zçğıöşüâî]+/).filter(Boolean);
const consonantRun = (s: string) => {
  let max = 0, cur = 0;
  for (const ch of s.toLocaleLowerCase("tr-TR")) {
    if (/[a-zçğşı]/.test(ch) && !VOWELS.includes(ch)) { cur++; max = Math.max(max, cur); } else cur = 0;
  }
  return max;
};

export function scoreMember(m: {
  email: string; first_name?: string | null; last_name?: string | null;
  hasAddress?: boolean; hasStockAlert?: boolean; burst?: number;
}): Suspicion {
  const reasons: string[] = [];
  let score = 0;
  const email = (m.email || "").trim().toLowerCase();
  const [local = "", domain = ""] = email.split("@");
  const first = (m.first_name || "").trim();
  const last = (m.last_name || "").trim();
  const full = `${first} ${last}`.trim();

  const dots = (local.match(/\./g) || []).length;
  if (/^(gmail|googlemail)\.com$/.test(domain) && dots >= 3) { score += 2; reasons.push("Noktalarla bölünmüş Gmail (bot kalıbı)"); }
  if ([...tokens(local), ...tokens(full)].some((t) => BAD_TOKENS.has(t))) { score += 3; reasons.push("Argo / spam kelime"); }
  if (DISPOSABLE.test(domain)) { score += 3; reasons.push("Geçici (tek kullanımlık) e-posta"); }
  if (consonantRun(local.replace(/[^a-zçğıöşü]/g, "")) >= 5) { score += 1; reasons.push("Anlamsız e-posta adresi"); }
  if (!full) { score += 1; reasons.push("Ad soyad yok"); }
  else {
    if (/\d/.test(full)) { score += 1; reasons.push("Adda rakam var"); }
    if (tokens(full).some((t) => consonantRun(t) >= 5)) { score += 1; reasons.push("Anlamsız ad"); }
    if (full.replace(/\s+/g, "").toLowerCase() === local.replace(/[^a-z0-9]/g, "")) { score += 1; reasons.push("Ad = e-posta"); }
  }
  if ((m.burst ?? 0) >= 5) { score += 1; reasons.push(`Aynı saatte ${m.burst} kayıt`); }

  // Gerçek kişi işaretleri
  const realName = (s: string) => /^[A-ZÇĞİÖŞÜ][a-zçğıöşüâî]{1,19}$/.test(s);
  if (first && last && realName(first.split(/\s+/)[0]) && realName(last.split(/\s+/).pop() || "")) { score -= 1; reasons.push("✓ Gerçek isim gibi"); }
  if (m.hasAddress) { score -= 1; reasons.push("✓ Adres girmiş"); }
  if (m.hasStockAlert) { score -= 2; reasons.push("✓ Stok bildirimi istemiş"); }

  const level: SuspicionLevel = score >= 3 ? "high" : score >= 1 ? "medium" : "low";
  return { score, level, reasons };
}
