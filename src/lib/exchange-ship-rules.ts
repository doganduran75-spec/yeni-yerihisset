// Değişim gönderisi kuralları (saf; regresyon Node'da doğrudan yükler — src/lib/exchange-shipping.ts)
type Offer = { id: string; name: string; price: string | null; amount: number | null };
const norm = (s: unknown) => String(s ?? "").toLocaleLowerCase("tr").replace(/[^a-z0-9çğıöşü]/g, "");

/** İlk gönderinin firması tercih edilir (ör. Sürat Kargo); yoksa fiyatı olan en ucuz. "Otomatik" (-1) son çare. */
export function pickOffer(offers: Offer[], prefer?: string | null): Offer | null {
  const ok = offers.filter((x) => x.amount != null && x.id !== "-1");
  const want = norm(prefer);
  const same = want.length >= 3 ? ok.find((x) => { const n = norm(x.name); return n.length >= 3 && (n === want || n.startsWith(want.slice(0, 5)) || want.startsWith(n.slice(0, 5))); }) : null;
  if (same) return same;
  const cheapest = [...ok].sort((a, b) => Number(a.amount) - Number(b.amount))[0];
  return cheapest ?? offers.find((x) => x.id === "-1") ?? null;
}

