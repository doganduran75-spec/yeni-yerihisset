// DEĞİŞİMDE GERİ GELEN ÜRÜN — ücret iadesi önerisi (kullanıcı 2026-11-14) — import yok; regresyon Node'da yükler.
// Değişimde alternatif numara siparişe aynı fiyatla eklenir ama müşteri ondan ücret ödemez (tek çiftin parasını ödedi,
// iki çift gönderildi). Tutmadığı çift geri gelince "İade al" ekranı eskiden o çiftin fiyatını iade olarak öneriyordu
// (ve "Ücret iadesini de şimdi yap" işaretliydi) → müşteriye ödemediği para iade edilecekti.
// Kural: her değişim çiftinde (asıl kalem + exchange_of ile ona bağlı alternatif) müşterinin elindeki fazladan (ücretsiz)
// adet önce düşülür; ücret iadesi yalnız ödenmiş adet geri gelirse doğar. Çift dışı kalemler eskisi gibi.
export type RetItem = { id: string; quantity: number | string; returned_qty?: number | string | null; unit_price: number | string; exchange_of?: string | null };

const n = (v: unknown) => Number(v || 0);

/** Seçilen geri dönüşte iade edilecek tutar (ödenmemiş fazla çift düşülmüş) + ücretsiz sayılan adet */
export function returnRefundSuggestion(items: RetItem[], sel: Record<string, number>): { amount: number; freeUnits: number } {
  const byId = new Map(items.map((i) => [i.id, i]));
  // Grup: asıl kalem kimliği → [asıl, alternatifler…]
  const groups = new Map<string, RetItem[]>();
  for (const i of items) {
    const root = i.exchange_of && byId.has(i.exchange_of) ? i.exchange_of : i.id;
    groups.set(root, [...(groups.get(root) || []), i]);
  }
  let amount = 0, freeUnits = 0;
  for (const [rootId, g] of groups) {
    const root = byId.get(rootId)!;
    const paidUnits = n(root.quantity);                                        // müşterinin ücretini ödediği adet
    const held = g.reduce((a, i) => a + n(i.quantity) - n(i.returned_qty), 0); // şu an müşteride olan adet
    let free = Math.max(0, held - paidUnits);                                  // ücretsiz (değişimde fazladan giden) adet
    const price = n(root.unit_price);
    // Önce alternatifler, sonra asıl kalem: geri gelen her adet önce ücretsiz adetten düşer
    for (const i of [...g].sort((a, b) => (a.exchange_of ? 0 : 1) - (b.exchange_of ? 0 : 1))) {
      let q = Math.min(n(sel[i.id]), n(i.quantity) - n(i.returned_qty));
      const f = Math.min(q, free); free -= f; freeUnits += f; q -= f;
      amount += q * (g.length > 1 ? price : n(i.unit_price));
    }
  }
  return { amount: Math.round(amount * 100) / 100, freeUnits };
}

/** Değişimde müşterinin tutmadığı kalemler (İade al ekranında varsayılan seçili olanlar) — tutulan seçilmemişse null */
export function exchangeReturnDefaults(items: RetItem[], keepItemId?: string | null): Set<string> | null {
  if (!keepItemId) return null;
  const keep = items.find((i) => i.id === keepItemId);
  if (!keep) return null;
  const root = keep.exchange_of || keep.id;
  return new Set(items.filter((i) => i.id !== keepItemId && (i.id === root || i.exchange_of === root)).map((i) => i.id));
}
