// Sipariş numarası gösterimi (tek yerden): sitenin kendi siparişleri "YH" + numara;
// pazaryeri ve diğer kanallar (Trendyol, Hepsiburada, Attipas…) kendi sipariş numarasıyla.
// Bkz. migration 20261019000001 (site sayacı yalnız site siparişlerine).

type OrderLike = {
  id?: string | null;
  order_number?: string | number | null;
  channel?: string | null;
  external_order_number?: string | null;
};

export function orderLabel(o: OrderLike | null | undefined): string {
  if (!o) return "—";
  const fallback = o.id ? `#${String(o.id).slice(0, 8).toUpperCase()}` : "—";
  if (o.channel && o.channel !== "site") return o.external_order_number ? String(o.external_order_number) : fallback;
  return o.order_number ? `YH${o.order_number}` : fallback;
}
