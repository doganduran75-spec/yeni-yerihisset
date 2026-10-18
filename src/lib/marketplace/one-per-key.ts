/* eslint-disable @typescript-eslint/no-explicit-any */
// Bir pakette aynı ilan anahtarı (satıcı kodu / barkod) iki kez gitmesin. Hepsiburada aynı MerchantSku iki kez
// gelince BÜTÜN paketi reddeder (DuplicateMerchantSkuSpecified). Pazaryerleri büyük/küçük harf ve baştaki/sondaki
// boşluğu ayırt etmez (ilan listesi de upper(btrim) ile eşleşir) → karşılaştırma normalize edilir.
// İki varyant aynı anahtarı taşıyorsa AKTİF ürünün aktif varyantı seçilir (ör. silinmeyip pasif kalan eski numara
// ile yeni numara aynı barkodu taşıyorsa); bütün satırlar aynı kalem numarasını paylaşır (sonuç ikisine de yazılır).

export const normKey = (k: unknown) => String(k ?? "").trim().toUpperCase();

export async function onePerKey<T extends { id: string; variant_id: string }>(
  sb: any, rows: T[], keyOf: (r: T) => string,
): Promise<{ picked: T[]; posOf: Map<string, number>; dupes: string[] }> {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const k = normKey(keyOf(r));
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const dupes = [...groups.entries()].filter(([, g]) => g.length > 1).map(([k]) => k);
  let active = new Set<string>();
  if (dupes.length) {
    const ids = dupes.flatMap((k) => groups.get(k)!.map((r) => r.variant_id));
    const { data } = await sb.from("product_variants").select("id, is_active, products(is_active)").in("id", ids);
    active = new Set(((data as any[]) || []).filter((v) => v.is_active !== false && v.products?.is_active !== false).map((v) => v.id));
  }
  const picked: T[] = [];
  const posOf = new Map<string, number>();
  for (const g of groups.values()) {
    const best = [...g].reverse().find((r) => active.has(r.variant_id)) ?? g[g.length - 1];
    picked.push(best);
    for (const r of g) posOf.set(r.id, picked.length);
  }
  return { picked, posOf, dupes };
}
