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
  | "return" | "refund" | "invoice" | "invoice_parasut" | "return_invoice" | "mp_restock"
  // satış sonrası (B aşaması — src/lib/after-sale.ts)
  | "fit_ok" | "case_link" | "ship_alt" | "alt_delivered" | "send_label" | "close_case"
  // "İade gelecek": müşteri iadeyi telefonla bildirdi → yönetici talep açar; kod gerekmiyorsa doğrudan yolda
  | "return_expected" | "return_in_transit";

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
  kargonomi_shipment_id?: string | null;   // taslak / onaylı gönderi (src/lib/kargonomi-flow.ts)
  kargonomi_confirmed_at?: string | null;  // firma seçildi → kargo kodu bekleniyor
  kargonomi_provider?: string | null;
  kargonomi_error?: string | null;
  parasut_status?: string | null;          // Paraşüt faturası (src/lib/parasut-invoice.ts)
  parasut_error?: string | null;
  mp_restocked_at?: string | null;
  order_items?: { quantity: number; returned_qty?: number | null }[] | null;
  created_at?: string | null;
  fit_status?: string | null;      // trial · ok · exchange · return
  delivered_at?: string | null;
  open_case?: { kind: string; status: string; return_method?: string | null; label_sent_at?: string | null } | null;
};

export const TRIAL_DAYS = 14;
export const UPS_WAIT_DAYS = 5;
export const RETURN_WAIT_DAYS = 4; // "iade yolda"dan bu kadar gün sonra gelmediyse bekleyen işlere düşer
const daysSince = (iso?: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : 0);

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
  // Eski siteden (WooCommerce) aktarılan siparişler: kargolanmışsa ya da 30 günden eskiyse geçmiş kayıttır →
  // bekleyen işlere düşmez (aktarım geçiş döneminde gelen, yeni ve henüz kargolanmamış olanlar düşer).
  // İstisna: aktarılan siparişte yeni sistemde iade / para iadesi / açık talep işleniyorsa iş sürüyor demektir
  // (ör. iade geldi → iade faturası kesilecek) → bekleyen işlerde kalır.
  const live = o.shipment_status === "returned" || Number(o.refunded_amount || 0) > 0 || !!o.open_case
    || !!o.order_items?.some((i) => Number(i.returned_qty || 0) > 0);
  if (o.import_source && !live && (SHIPPED.includes(o.shipment_status || "waiting") || daysSince(o.created_at) > 30)) return { ...r, needsAction: false };
  // Paraşüt faturası kesiliyor / hata verdi (fatura adımı sırasında)
  const ps = o.parasut_status;
  if (ps && ps !== "done" && (o.invoice_status || "pending") === "pending" && r.actions.some((a) => a.key === "invoice")) {
    return ps === "error"
      ? { ...r, stage: `${r.stage} — Paraşüt faturası kesilemedi`, hint: o.parasut_error || r.hint,
          actions: r.actions.map((a) => (a.key === "invoice_parasut" ? { ...a, label: "Paraşüt — yeniden dene" } : a)), needsAction: true }
      : { ...r, stage: "Fatura kesiliyor (Paraşüt)", hint: "e-Arşiv / e-Fatura hazırlanıyor; dakikada bir kontrol edilir, bitince “Faturalandı” olur.",
          actions: [{ key: "invoice_parasut", label: "Paraşüt durumu", kind: "primary" }], needsAction: false };
  }
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
  // Paraşüt açıksa ilk düğme (kapalıysa sipariş ekranı gizler)
  const invoiceActs: NextAction[] = [{ key: "invoice_parasut", label: "Faturayı kes (Paraşüt)", kind: "primary" }, invoiceAction];

  // ── Pazaryeri: durumları pazaryeri yönetir ──
  if (isMarketplaceOrder(o)) {
    if (o.status === "cancelled") return { stage: "İptal edildi (pazaryeri)", actions: [], needsAction: false };
    if (o.status === "refunded" || ship === "returned") {
      return o.mp_restocked_at
        ? { stage: "İade geldi, stoğa eklendi", actions: [], needsAction: false }
        : { stage: "İade (pazaryeri)", hint: "Ürün depoya döndüyse stoğa ekle; para iadesini pazaryeri yapar.", actions: [{ key: "mp_restock", label: "İade geldi, stoğa ekle", kind: "danger" }], needsAction: true };
    }
    if (inv === "pending" && !SHIPPED.includes(ship)) {
      return { stage: "Yeni sipariş", hint: "Kargodan önce faturayı kes.", actions: invoiceActs, needsAction: true };
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
    // Kargonomi: firma seçildi, kod bekleniyor (dakikada bir sorgulanır; 1 saati geçerse ya da firma hata verirse iş yöneticide)
    if (o.kargonomi_confirmed_at && !o.kargonomi_tracking_code) {
      const late = daysSince(o.kargonomi_confirmed_at) > 1 / 24;
      const firm = o.kargonomi_provider ? ` (${o.kargonomi_provider})` : "";
      return o.kargonomi_error
        ? { stage: "Kargonomi: gönderi oluşturulamadı", hint: o.kargonomi_error, actions: [
            { key: "ship_kargonomi", label: "Kargonomi — iptal et / yeniden teklif", kind: "primary" },
            { key: "ship_manual", label: "Kargoya verildi (elle)", kind: "primary" },
          ], needsAction: true }
        : { stage: `Kargo kodu bekleniyor${firm}`, hint: late
            ? "1 saattir kod gelmedi — Kargonomi panelinden kontrol et."
            : "Kod gelince sipariş kendiliğinden “Kargoda” olur ve müşteriye takip numarası gider (dakikada bir sorgulanır).",
          actions: [{ key: "ship_kargonomi", label: "Kargonomi durumu", kind: "primary" }], needsAction: late };
    }
    return { stage: o.kargonomi_shipment_id ? "Hazırlanıyor — kargo firması seçilmedi" : "Hazırlanıyor", hint: "Kargoya ver.", actions: [
      ...(o.kargonomi_tracking_code ? [] : [{ key: "ship_kargonomi", label: o.kargonomi_shipment_id ? "Kargo firmasını seç (Kargonomi)" : "Kargoya ver (Kargonomi)", kind: "primary" } as NextAction]),
      { key: "ship_manual", label: "Kargoya verildi (elle)", kind: "primary" },
      { key: "cancel", label: "Siparişi iptal et + para iadesi", kind: "danger" },
    ], needsAction: true };
  }

  // Satış sonrası açık talep (değişim / iade) — kargodan sonra her şeyden önce
  const c = o.open_case;
  if (c) {
    const upsLate = c.status === "label_sent" && c.return_method === "ups" && daysSince(c.label_sent_at) > UPS_WAIT_DAYS;
    const upsHint = upsLate ? `UPS ${UPS_WAIT_DAYS} gündür almadı — Sürat ya da Aras için yeni kod gönder.` : undefined;
    const close: NextAction = { key: "close_case", label: "Talebi kapat", kind: "danger" };
    if (c.kind === "return") {
      if (c.status === "requested") return { stage: "İade talebi", hint: "Kargonomi'den etiket oluştur, kodu gir — müşteriye e-postayla gider. Müşteri kendisi gönderiyorsa “Kod gerekmiyor”.", actions: [
        { key: "send_label", label: "İade kodunu gönder", kind: "primary" },
        { key: "return_in_transit", label: "Kod gerekmiyor — iade yolda", kind: "primary" }, close,
      ], needsAction: true };
      const late = daysSince(c.label_sent_at) > RETURN_WAIT_DAYS;
      return { stage: "İade yolda", hint: upsHint ?? (late ? `${RETURN_WAIT_DAYS} gündür iade gelmedi — müşteriyle görüş.` : "Ürün gelince “İade geldi”."), actions: [
        { key: "return", label: "İade geldi", kind: "danger" },
        { key: "send_label", label: c.return_method === "self" ? "Kargo kodu gönder" : "Kodu değiştir / yeniden gönder", kind: "primary" }, close,
      ], needsAction: upsLate || late };
    }
    switch (c.status) {
      case "requested": return { stage: "Değişim talebi", hint: "İstenen numarayı gönder.", actions: [{ key: "ship_alt", label: "Alternatifi gönder", kind: "primary" }, close], needsAction: true };
      case "waiting_stock": return { stage: "Değişim — stok bekleniyor", hint: "Müşteri istediği numaranın gelmesini bekliyor.", actions: [{ key: "ship_alt", label: "Alternatifi gönder", kind: "primary" }, close], needsAction: false };
      case "alt_shipped": return { stage: "Değişim — alternatif kargoda", actions: [{ key: "alt_delivered", label: "Alternatif teslim edildi", kind: "primary" }], needsAction: false };
      case "alt_delivered": return { stage: "Değişim — müşteri deniyor", hint: "Müşteri hangisinin olduğunu seçecek (e-postayla soruldu).", actions: [{ key: "case_link", label: "Müşteri adına seç", kind: "primary" }], needsAction: false };
      case "keep_chosen": return { stage: "Değişim — müşteri seçti", hint: "Tutulmayan ürün için kargo kodu gönder.", actions: [{ key: "send_label", label: "Geri gönderim kodunu gönder", kind: "primary" }], needsAction: true };
      default: return { stage: "Değişim — tutulmayan ürün yolda", hint: upsHint ?? "Ürün gelince “İade geldi” (stoğa ekle, para iadesi yok).", actions: [{ key: "return", label: "İade geldi", kind: "danger" }, { key: "send_label", label: "Kodu değiştir / yeniden gönder", kind: "primary" }], needsAction: upsLate };
    }
  }

  // Kargodan sonra: iade geldiyse önce para iadesi + iade faturası
  if (someReturned) {
    const acts: NextAction[] = [];
    if (paid && remaining > 0) acts.push({ key: "refund", label: "Ücret iadesi yap", kind: "danger" });
    if (!allReturned) acts.push({ key: "return", label: "İade al", kind: "danger" });
    if (inv === "invoiced" && (pay === "refunded" || pay === "partial_refund")) acts.push({ key: "return_invoice", label: "İade faturası kesildi", kind: "primary" });
    if (inv === "pending" && !allReturned) acts.push(...invoiceActs);
    const due = acts.some((a) => a.key === "refund" || a.key === "return_invoice");
    const refundDue = acts.some((a) => a.key === "refund");
    // İadenin son adımı: faturası kesilmiş siparişte para iade edildiyse iade faturası kesilir
    const onlyInvoice = !refundDue && acts.some((a) => a.key === "return_invoice");
    return {
      stage: onlyInvoice ? "İade faturası kesilecek" : allReturned ? "İade geldi" : "Kısmi iade geldi",
      hint: refundDue ? "İade gelen ürünün ücretini iade et." : onlyInvoice ? "Ücret iade edildi; faturası kesilmiş siparişin iade faturasını kes, sonra “İade faturası kesildi”." : undefined,
      actions: acts, needsAction: due,
    };
  }

  if (ship === "shipped" || ship === "undelivered") {
    return { stage: ship === "undelivered" ? "Teslim edilemedi" : "Kargoda", hint: "Teslim bilgisi kargo takibinden gelir.", actions: [
      { key: "mark_delivered", label: "Teslim edildi", kind: "primary" },
      { key: "return", label: "İade al", kind: "danger" },
    ], needsAction: ship === "undelivered" };
  }

  // Teslim edildi — müşteri deniyor ("oldu mu?" e-postası gitti); 14 gün cevap yoksa oldu sayılır
  if (o.fit_status === "trial" && daysSince(o.delivered_at) < TRIAL_DAYS) {
    return { stage: "Teslim edildi — müşteri deniyor", hint: `Müşteri ${TRIAL_DAYS} gün içinde “oldu / değişim / iade” diyecek.`, actions: [
      { key: "fit_ok", label: "Oldu say", kind: "primary" },
      { key: "return_expected", label: "İade gelecek", kind: "danger" },
      { key: "case_link", label: "Müşteri adına değişim / iade aç", kind: "primary" },
      { key: "return", label: "İade al", kind: "danger" },
    ], needsAction: false };
  }

  // Teslim edildi (oldu / süre doldu / eski sipariş)
  const acts: NextAction[] = [];
  if (inv === "pending") acts.push(...invoiceActs);
  if (ship === "delivered") acts.push({ key: "return_expected", label: "İade gelecek", kind: "danger" });
  acts.push({ key: "return", label: "İade al", kind: "danger" });
  return inv === "pending"
    ? { stage: "Teslim edildi", hint: "Müşteri memnunsa faturayı kes.", actions: acts, needsAction: true }
    : { stage: "Tamamlandı", actions: acts, needsAction: false };
}
