// IBAN SAHİBİ ↔ SİPARİŞ SAHİBİ (kullanıcı 2026-11-12) — import yok; regresyon Node'da doğrudan yükler.
// Havale iadesi (müşteri iptali / satış sonrası iade) müşterinin yazdığı IBAN'a gider. Sipariş e-postası yanlış kişiye
// gittiyse o kişi kendi IBAN'ını yazıp iadeyi kendine yönlendirebilir → IBAN sahibinin adı siparişteki adla uyuşmazsa
// talep işaretlenir (engellenmez: aile üyesinin hesabı olabilir; karar yöneticide).
const norm = (s: unknown) => String(s ?? "").toLocaleLowerCase("tr-TR")
  .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
  .replace(/[^a-z\s]+/g, " ").trim().split(/\s+/).filter((t) => t.length >= 2);

/** IBAN sahibi, sipariş sahibiyle aynı kişi görünüyor mu? (soyadı + adlardan biri) — sipariş adı yoksa true */
export function ibanNameMatches(ibanName: unknown, orderName: unknown): boolean {
  const o = norm(orderName);
  if (o.length < 2) return true; // karşılaştıracak ad yok
  const i = new Set(norm(ibanName));
  const last = o[o.length - 1];
  return i.has(last) && o.slice(0, -1).some((t) => i.has(t));
}
