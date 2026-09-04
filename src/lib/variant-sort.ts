/**
 * Varyasyon değeri sıralama — "açılma/oluşturma sırası" yerine anlamlı sıra.
 *
 * Kapsanan durumlar:
 *   - Sayısal numaralar:  38, 39, 40, 41 …  ve  90, 100, 120  → artan (string
 *     sıralamasındaki "120 < 90" hatası olmaz; sayısal karşılaştırılır).
 *   - Konfeksiyon bedenleri:  XS, S, M, L, XL, XXL, 2XL, 3XL …  → beden sırası
 *     (alfabetik değil; "L, M, S, XL" gibi yanlış sıra oluşmaz).
 *   - Karışık/metin:  doğal (natural) sıralama, Türkçe duyarlı.
 *
 * Not: Şemada elle sıra kolonu yoktur; bu yüzden sıra GÖRÜNTÜLEME anında,
 * deterministik biçimde hesaplanır. İleride variant_options'a bir sort_order
 * kolonu eklenirse önce ona, eşitlikte buna göre sıralanabilir.
 */

// Beden kısaltmaları → sıra numarası. "XXL" ile "2XL" eşdeğer sayılır.
const SIZE_RANK: Record<string, number> = {
  xxxs: -3, xxs: -2, xs: -1, s: 0, m: 1, l: 2,
  xl: 3, xxl: 4, xxxl: 5, xxxxl: 6, xxxxxl: 7,
};

function sizeRank(raw: string): number | null {
  const v = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (v in SIZE_RANK) return SIZE_RANK[v];
  // "2xl", "3xl" → xxl, xxxl eşdeğeri
  const m = v.match(/^(\d+)xl$/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 2 && n <= 6) return 2 + n; // 2xl=4(xxl), 3xl=5 …
  }
  return null;
}

// Baştaki ilk sayıyı çıkar (ör. "90-120" → 90, "40 Numara" → 40).
function leadingNumber(raw: string): number | null {
  const m = raw.trim().match(/^-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** İki varyasyon değerini anlamlı sıraya göre karşılaştırır. */
export function compareVariantValues(a: string, b: string): number {
  const sa = sizeRank(a);
  const sb = sizeRank(b);
  if (sa !== null && sb !== null) return sa - sb;          // ikisi de beden
  if (sa !== null) return -1;                               // beden önce
  if (sb !== null) return 1;

  const na = leadingNumber(a);
  const nb = leadingNumber(b);
  if (na !== null && nb !== null && na !== nb) return na - nb; // sayısal

  // Doğal/Türkçe sıralama (sayı-duyarlı)
  return a.localeCompare(b, "tr", { numeric: true, sensitivity: "base" });
}

/**
 * Bir dizi öğeyi, `getValue` ile alınan varyasyon değerine göre sıralar.
 * Orijinal diziyi bozmaz (kopya döner).
 */
export function sortByVariantValue<T>(items: T[], getValue: (item: T) => string | null | undefined): T[] {
  return [...items].sort((x, y) =>
    compareVariantValues(String(getValue(x) ?? ""), String(getValue(y) ?? ""))
  );
}
