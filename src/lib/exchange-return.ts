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

/** DEĞİŞİMDE GERİ GELEN ÜRÜN SONRASI (kullanıcı 2026-11-26: geri gelecek ürün müşteri seçmeden de gelebilir — YH25047).
 *  roots = talepteki asıl kalemler. Her çiftte (asıl + yerine giden) müşteride ödediği kadar adet kaldıysa değişim TAMAM
 *  (keepId = müşteride kalan kalem); çiftlerin tamamı geri geldiyse değişim İADEYE döndü (ücret iadesi sırası). */
export function exchangeBackResult(items: RetItem[], roots: string[]): { done: boolean; allBack: boolean; keepId: string | null } {
  let done = roots.length > 0, allBack = roots.length > 0, keepId: string | null = null;
  for (const root of roots) {
    const g = items.filter((i) => i.id === root || i.exchange_of === root);
    const rootItem = g.find((i) => i.id === root);
    if (!rootItem) { done = false; allBack = false; continue; }
    const held = g.reduce((a, i) => a + n(i.quantity) - n(i.returned_qty), 0);
    if (held > n(rootItem.quantity)) done = false;
    if (held > 0) allBack = false;
    if (!keepId) keepId = g.find((i) => n(i.quantity) - n(i.returned_qty) > 0)?.id ?? null;
  }
  return { done: done && !allBack, allBack, keepId };
}

// İADE TUTARI — PARA + KREDİ (kullanıcı 2026-11-26): iade kargosu bizde. Siparişin TÜMÜ geri geldiyse kalan her şey iade
// edilir (kargo dahil; kullanılan YeriHisset Kredisi de cüzdana döner). Bir kısmı geldiyse yalnız o ürünlerin bedeli: kupon
// payı düşülür, kalan tutar siparişin ödeme oranında bölünür (para → karta / hesaba, kredi → cüzdana).
export type RefundOrder = {
  total_amount: number | string; refunded_amount?: number | string | null;
  credit_used?: number | string | null; credit_restored_amount?: number | string | null; coupon_discount?: number | string | null;
};
const r2 = (v: number) => Math.round(v * 100) / 100;

/** productValue = geri gelen ücretli ürünlerin bedeli (returnRefundSuggestion.amount); allBack = sipariş tamamen geri geldi */
export function refundSplit(o: RefundOrder, items: RetItem[], productValue: number, allBack: boolean): { cash: number; credit: number } {
  const total = n(o.total_amount), used = n(o.credit_used);
  const cashLeft = Math.max(0, r2(total - n(o.refunded_amount)));
  const creditLeft = Math.max(0, r2(used - n(o.credit_restored_amount)));
  if (allBack) return { cash: cashLeft, credit: creditLeft };
  // Ürün toplamı: değişimde eklenen (ücretsiz) alternatifler sayılmaz
  const itemsTotal = items.filter((i) => !i.exchange_of).reduce((a, i) => a + n(i.unit_price) * n(i.quantity), 0);
  const net = productValue * (itemsTotal > 0 ? Math.max(0, 1 - n(o.coupon_discount) / itemsTotal) : 1);
  const pool = total + used;
  const cash = pool > 0 ? net * (total / pool) : net;
  const credit = pool > 0 ? net * (used / pool) : 0;
  return { cash: Math.min(cashLeft, r2(cash)), credit: Math.min(creditLeft, r2(credit)) };
}
