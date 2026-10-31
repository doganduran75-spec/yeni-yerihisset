// SİPARİŞİN SIRADAKİ ADIMI — hangi durumda hangi düğme (kullanıcı onaylı akış, 2026-10-10).
// Tek kaynak: admin sipariş detayındaki "Sıradaki adım" paneli ve listedeki "Bekleyen işlerim" filtresi
// bunu kullanır. Sunucu tarafı kurallar (/api/admin/orders/action, order_* fonksiyonları) aynı sırayı
// ayrıca denetler — burada gösterilmeyen işlem doğrudan istekle de yapılamaz.
//
// Site:      Ödeme bekleniyor → Hazırlanıyor → [Paket hazır] → Kargo bekliyor → [Kurye aldı] → Kargoda → Teslim edildi → (Fatura kes) → Tamamlandı
//            iptal yalnız kargodan ÖNCE; kargodan sonra "İade al" (para iadesi aynı pencerede, ürün geldikten sonra)
// Pazaryeri: [Paket hazır] → fatura kendiliğinden (Paraşüt → pazaryerine yükle → Trendyol "İşleme al") →
//            kargo/teslim/iade pazaryerinden → İade geldi → Stoğa ekle   ("Paket hazır" akışı, 2026-10-24)

export type NextActionKey =
  | "mark_paid" | "cancel" | "ship_kargonomi" | "ship_manual" | "mark_delivered"
  | "return" | "refund" | "invoice" | "invoice_parasut" | "return_invoice" | "mp_restock"
  // satış sonrası (B aşaması — src/lib/after-sale.ts)
  | "fit_ok" | "case_link" | "ship_alt" | "alt_delivered" | "send_label" | "close_case"
  // "İade gelecek": müşteri iadeyi telefonla bildirdi → yönetici talep açar; kod gerekmiyorsa doğrudan yolda
  | "return_expected" | "return_in_transit"
  // "Paket hazır" akışı (src/app/api/admin/orders/ship-flow)
  | "packed" | "picked_up" | "mp_picking" | "hb_package" | "mp_return";

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
  packed_at?: string | null;               // "Paket hazır"
  mp_picking_at?: string | null;           // Trendyol "İşleme al" yapıldı
  mp_picking_error?: string | null;
  cargo_tracking_number?: string | null;
  mp_package_number?: string | null;       // Hepsiburada paket no (paketlenince)
  shipped_at?: string | null;              // kargoya verildiği an (fatura 7 gün takibi)
  order_items?: { quantity: number; returned_qty?: number | null }[] | null;
  created_at?: string | null;
  fit_status?: string | null;      // trial · ok · exchange · return
  delivered_at?: string | null;
  open_case?: { kind: string; status: string; return_method?: string | null; label_sent_at?: string | null } | null;
};

export const TRIAL_DAYS = 14;
export const UPS_WAIT_DAYS = 5;
// Kargolanmış ama faturası kesilmemiş (kullanıcı 2026-10-28). Paraşüt'e geçiş (2026-10-21) öncesinin pazaryeri ve eski siteden
// aktarılan siparişleri sayılmaz (eski düzende faturalandı); sonrasında eski siteden aktarılanlar DAHİL. VUK: teslimden (kargoya verilişten) itibaren 7 gün.
export const UNINVOICED_SINCE = "2026-10-21";
export const INVOICE_DAYS = 7;
export const RETURN_WAIT_DAYS = 4; // "iade yolda"dan bu kadar gün sonra hâlâ gelmediyse sipariş detayında uyarı (kullanıcı 2026-10-28:
// yoldaki iadeler panodaki "Yolda olan iade" satırında iş olarak takip edilir → "Bekleyen sipariş işi"ne düşmez)
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
  // Paraşüt faturası kesiliyor / hata verdi (fatura adımı sırasında) — eski siteden aktarılan siparişte de görünür
  const ps = o.parasut_status;
  if (ps && ps !== "done" && (o.invoice_status || "pending") === "pending" && r.actions.some((a) => a.key === "invoice")) {
    return ps === "error"
      ? { ...r, stage: `${r.stage} — Paraşüt faturası kesilemedi`, hint: o.parasut_error || r.hint,
          actions: r.actions.map((a) => (a.key === "invoice_parasut" ? { ...a, label: "Paraşüt — yeniden dene" } : a)), needsAction: true }
      : { ...r, stage: "Fatura kesiliyor (Paraşüt)", hint: "e-Arşiv / e-Fatura hazırlanıyor; dakikada bir kontrol edilir, bitince “Faturalandı” olur.",
          actions: [{ key: "invoice_parasut", label: "Paraşüt durumu", kind: "primary" }], needsAction: false };
  }
  if (o.import_source && !live && (SHIPPED.includes(o.shipment_status || "waiting") || daysSince(o.created_at) > 30)) return { ...r, needsAction: false };
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
  const packedAction: NextAction = { key: "packed", label: "Paket hazır", kind: "primary" };

  // ── Pazaryeri: durumları pazaryeri yönetir ──
  if (isMarketplaceOrder(o)) {
    if (o.status === "cancelled") return { stage: "İptal edildi (pazaryeri)", actions: [], needsAction: false };
    if (o.status === "refunded" || ship === "returned") {
      return o.mp_restocked_at
        ? { stage: "İade geldi, stoğa eklendi", actions: [], needsAction: false }
        : { stage: "İade (pazaryeri)", hint: "Ürün depoya döndüyse stoğa ekle; para iadesini pazaryeri yapar.", actions: [{ key: "mp_restock", label: "İade geldi, stoğa ekle", kind: "danger" }], needsAction: true };
    }
    if (inv === "pending" && !SHIPPED.includes(ship)) {
      if (!o.packed_at) return { stage: "Yeni sipariş", hint: "Etiketi bas, paketi hazırla, “Paket hazır” de — fatura kendiliğinden kesilir ve pazaryerine yüklenir.", actions: [packedAction], needsAction: true };
      return { stage: "Paket hazır — fatura kesilecek", hint: "Fatura kendiliğinden kesilmedi (Paraşüt kapalı ya da hata) — kes ya da kesildiyse işaretle.", actions: invoiceActs, needsAction: true };
    }
    // Hepsiburada: paket hazır dendi ama paketlenemedi (paket no yok) → yeniden dene
    if (o.channel === "hepsiburada" && o.packed_at && !o.mp_package_number && !SHIPPED.includes(ship)) {
      return { stage: "Hepsiburada'da paketlenmedi", hint: "Paket hazır dendi ama Hepsiburada paketlemesi yapılamadı (notlara bak) — yeniden dene ya da Hepsiburada panelinden paketle.",
        actions: [{ key: "hb_package", label: "Hepsiburada — paketle", kind: "primary" }, ...(inv === "pending" ? invoiceActs : [])], needsAction: true };
    }
    if (o.channel === "trendyol" && o.packed_at && !o.mp_picking_at && o.mp_picking_error && !SHIPPED.includes(ship)) {
      return { stage: "Trendyol'da “İşleme al” yapılamadı", hint: o.mp_picking_error, actions: [{ key: "mp_picking", label: "Trendyol — işleme al", kind: "primary" }], needsAction: true };
    }
    // Kargolanmış ama faturası kesilmemiş (unutuldu / eski firmadan geçiş): düğme kalır; yalnız son 7 günün
    // siparişi bekleyen işlere düşer (eski firmanın faturaladığı geçmiş siparişler listeyi doldurmasın)
    if (inv === "pending") {
      return { stage: "Fatura kesilmedi (pazaryeri)", hint: "Kargoya verilmiş; faturası kesilmediyse kes. Eski firma faturaladıysa “Fatura kesildi” işaretle.", actions: invoiceActs, needsAction: daysSince(o.created_at) <= 7 };
    }
    // Hepsiburada / Amazon iadesi otomatik gelmiyor → ürün geri gelince elle (ödeme "iade edildi", ciro düşer, stok isteğe bağlı)
    const manualReturn = SHIPPED.includes(ship) && o.channel !== "trendyol";
    return { stage: SHIPPED.includes(ship) ? "Kargoda / teslim (pazaryeri)" : "Kargo bekleniyor (pazaryeri)", hint: "Durum pazaryerinden gelir.",
      actions: manualReturn ? [{ key: "mp_return", label: "İade geldi", kind: "danger" }] : [], needsAction: false };
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
            : "Kod gelince siparişe yazılır (dakikada bir sorgulanır); sonra etiketi bas, “Paket hazır” de.",
          actions: [{ key: "ship_kargonomi", label: "Kargonomi durumu", kind: "primary" }], needsAction: late };
    }
    // Paket hazır → kurye bekleniyor (müşteriye e-posta "Kurye aldı"da gider; listede toplu düğme)
    if (o.packed_at) {
      return { stage: "Kargo bekliyor — paket hazır", hint: "Kurye alınca “Kurye aldı” — müşteriye kargo e-postası o an gider.", actions: [
        { key: "picked_up", label: "Kurye aldı", kind: "primary" },
        { key: "cancel", label: "Siparişi iptal et + para iadesi", kind: "danger" },
      ], needsAction: daysSince(o.packed_at) > 1 };
    }
    const hasCode = !!(o.kargonomi_tracking_code || o.cargo_tracking_number);
    return { stage: o.kargonomi_shipment_id && !hasCode ? "Hazırlanıyor — kargo firması seçilmedi" : "Hazırlanıyor",
      hint: hasCode ? "Etiketi bas, paketi hazırla, “Paket hazır” de." : "Kargo kodunu al (Kargonomi ya da etiket kutusundan elle), etiketi bas, “Paket hazır” de.", actions: [
      ...(hasCode ? [] : [{ key: "ship_kargonomi", label: o.kargonomi_shipment_id ? "Kargo firmasını seç (Kargonomi)" : "Kargoya ver (Kargonomi)", kind: "primary" } as NextAction]),
      packedAction,
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
      // Takip panodaki "Yolda olan iade" satırında (iş olarak) → burada needsAction yok (iki yerde görünmesin)
      return { stage: "İade yolda", hint: upsHint ?? (late ? `${Math.floor(daysSince(c.label_sent_at))} gündür yolda — gelmediyse müşteriyle görüş.` : "Ürün gelince “İade geldi”."), actions: [
        { key: "return", label: "İade geldi", kind: "danger" },
        { key: "send_label", label: c.return_method === "self" ? "Kargo kodu gönder" : "Kodu değiştir / yeniden gönder", kind: "primary" }, close,
      ], needsAction: false };
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
  const silent = o.fit_status === "trial"; // 14 gün doldu, müşteri cevap vermedi → fatura otomatik DEĞİL, yönetici onaylar
  return inv === "pending"
    ? { stage: silent ? `${TRIAL_DAYS} gün doldu, cevap yok — fatura kesilsin mi?` : o.fit_status === "ok" ? "Oldu — fatura kesilecek" : "Teslim edildi",
        hint: silent ? "Müşteri oldu / değişim / iade demedi. Uygunsa faturayı kes (PDF müşteriye e-postayla gider)." : "Fatura kendiliğinden kesilmediyse (Paraşüt kapalı / hata) kes.",
        actions: acts, needsAction: true }
    : { stage: "Tamamlandı", actions: acts, needsAction: false };
}
