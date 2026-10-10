// SİPARİŞİN SIRADAKİ ADIMI — hangi durumda hangi düğme (kullanıcı onaylı akış, 2026-10-10).
// Tek kaynak: admin sipariş detayındaki "Sıradaki adım" paneli ve listedeki "Bekleyen işlerim" filtresi
// bunu kullanır. Sunucu tarafı kurallar (/api/admin/orders/action, order_* fonksiyonları) aynı sırayı
// ayrıca denetler — burada gösterilmeyen işlem doğrudan istekle de yapılamaz.
//
// Site:      Ödeme bekleniyor → Hazırlanıyor → Kargoda → Teslim edildi → (Fatura kes) → Tamamlandı
//            iptal yalnız kargodan ÖNCE; kargodan sonra "İade al" (para iadesi aynı pencerede, ürün geldikten sonra)
// Pazaryeri: Fatura kes (kargodan önce) → kargo/teslim/iade pazaryerinden → İade geldi → Stoğa ekle

export type NextActionKey =
  | "mark_paid" | "cancel" | "ship_kargonomi" | "ship_manual" | "mark_delivered"
  | "return" | "refund" | "invoice" | "return_invoice" | "mp_restock";

export type NextAction = { key: NextActionKey; label: string; kind: "primary" | "danger" };

export type OrderLike = {
  channel?: string | null;
  import_source?: string | null;
  status?: string | null;
  payment_status?: string | null;
  shipment_status?: string | null;
  invoice_status?: string | null;
  total_amount?: number | string | null;
  refunded_amount?: number | string | null;
  kargonomi_tracking_code?: string | null;
  mp_restocked_at?: string | null;
  order_items?: { quantity: number; returned_qty?: number | null }[] | null;
};

export type NextStep = {
  stage: string;          // ekranda gösterilecek aşama adı
  hint?: string;          // kısa açıklama (neyi bekliyoruz)
  actions: NextAction[];
  needsAction: boolean;   // "Bekleyen işlerim"de görünsün mü (sıra yöneticide mi)
};

const SHIPPED = ["shipped", "delivered", "undelivered", "returned"];

export function isMarketplaceOrder(o: OrderLike) {
  return (o.channel || "site") !== "site" && !o.import_source;
}

export function orderNextStep(o: OrderLike): NextStep {
  const r = coreNextStep(o);
  // Eski siteden (WooCommerce) aktarılan ve kargolanmış siparişler geçmiş kayıttır → bekleyen işlere düşmez
  // (aktarım geçiş döneminde gelen, henüz kargolanmamış siparişler düşer).
  if (o.import_source && SHIPPED.includes(o.shipment_status || "waiting")) return { ...r, needsAction: false };
  return r;
}

function coreNextStep(o: OrderLike): NextStep {
  const pay = o.payment_status || "pending";
  const ship = o.shipment_status || "waiting";
  const inv = o.invoice_status || "pending";
  const paid = pay === "paid" || pay === "partial_refund";
  const remaining = Math.round((Number(o.total_amount || 0) - Number(o.refunded_amount || 0)) * 100) / 100;
  const items = o.order_items ?? null;
  const someReturned = ship === "returned" || !!items?.some((i) => Number(i.returned_qty || 0) > 0);
  const allReturned = ship === "returned" || (!!items?.length && items.every((i) => Number(i.returned_qty || 0) >= Number(i.quantity)));
  const invoiceAction: NextAction = { key: "invoice", label: "Fatura kesildi", kind: "primary" };

  // ── Pazaryeri: durumları pazaryeri yönetir ──
  if (isMarketplaceOrder(o)) {
    if (o.status === "cancelled") return { stage: "İptal edildi (pazaryeri)", actions: [], needsAction: false };
    if (o.status === "refunded" || ship === "returned") {
      return o.mp_restocked_at
        ? { stage: "İade geldi, stoğa eklendi", actions: [], needsAction: false }
        : { stage: "İade (pazaryeri)", hint: "Ürün depoya döndüyse stoğa ekle; para iadesini pazaryeri yapar.", actions: [{ key: "mp_restock", label: "İade geldi, stoğa ekle", kind: "danger" }], needsAction: true };
    }
    if (inv === "pending" && !SHIPPED.includes(ship)) {
      return { stage: "Yeni sipariş", hint: "Kargodan önce faturayı kes.", actions: [invoiceAction], needsAction: true };
    }
    return { stage: SHIPPED.includes(ship) ? "Kargoda / teslim (pazaryeri)" : "Kargo bekleniyor (pazaryeri)", hint: "Durum pazaryerinden gelir.", actions: [], needsAction: false };
  }

  // ── Site ──
  if (o.status === "cancelled") {
    if (paid && remaining > 0) return { stage: "İptal edildi", hint: "Ücret iadesi kaydı eksik.", actions: [{ key: "refund", label: "Ücret iadesi yap", kind: "danger" }], needsAction: true };
    if (inv === "invoiced") return { stage: "İptal edildi", hint: "Fatura kesilmişti: iade faturası kes.", actions: [{ key: "return_invoice", label: "İade faturası kesildi", kind: "primary" }], needsAction: true };
    return { stage: "İptal edildi", actions: [], needsAction: false };
  }

  if (!SHIPPED.includes(ship)) {
    if (!paid) {
      return { stage: "Ödeme bekleniyor", hint: "Havale gelince onayla; 24 saatte ödenmezse kendiliğinden iptal olur.", actions: [
        { key: "mark_paid", label: "Ödeme alındı", kind: "primary" },
        { key: "cancel", label: "Siparişi iptal et", kind: "danger" },
      ], needsAction: true };
    }
    return { stage: "Hazırlanıyor", hint: "Kargoya ver.", actions: [
      ...(o.kargonomi_tracking_code ? [] : [{ key: "ship_kargonomi", label: "Kargoya ver (Kargonomi)", kind: "primary" } as NextAction]),
      { key: "ship_manual", label: "Kargoya verildi (elle)", kind: "primary" },
      { key: "cancel", label: "Siparişi iptal et + para iadesi", kind: "danger" },
    ], needsAction: true };
  }

  // Kargodan sonra: iade geldiyse önce para iadesi + iade faturası
  if (someReturned) {
    const acts: NextAction[] = [];
    if (paid && remaining > 0) acts.push({ key: "refund", label: "Ücret iadesi yap", kind: "danger" });
    if (!allReturned) acts.push({ key: "return", label: "İade al", kind: "danger" });
    if (inv === "invoiced" && (pay === "refunded" || pay === "partial_refund")) acts.push({ key: "return_invoice", label: "İade faturası kesildi", kind: "primary" });
    if (inv === "pending" && !allReturned) acts.push(invoiceAction);
    const due = acts.some((a) => a.key === "refund" || a.key === "return_invoice");
    return { stage: allReturned ? "İade geldi" : "Kısmi iade geldi", hint: due ? "İade gelen ürünün ücretini iade et." : undefined, actions: acts, needsAction: due };
  }

  if (ship === "shipped" || ship === "undelivered") {
    return { stage: ship === "undelivered" ? "Teslim edilemedi" : "Kargoda", hint: "Teslim bilgisi kargo takibinden gelir.", actions: [
      { key: "mark_delivered", label: "Teslim edildi", kind: "primary" },
      { key: "return", label: "İade al", kind: "danger" },
    ], needsAction: ship === "undelivered" };
  }

  // Teslim edildi
  const acts: NextAction[] = [];
  if (inv === "pending") acts.push(invoiceAction);
  acts.push({ key: "return", label: "İade al", kind: "danger" });
  return inv === "pending"
    ? { stage: "Teslim edildi", hint: "Müşteri memnunsa faturayı kes.", actions: acts, needsAction: true }
    : { stage: "Tamamlandı", actions: acts, needsAction: false };
}
