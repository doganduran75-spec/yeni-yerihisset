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
  | "return" | "refund" | "invoice" | "invoice_parasut" | "return_invoice" | "return_invoice_parasut" | "mp_restock"
  // satış sonrası (B aşaması — src/lib/after-sale.ts)
  | "fit_ok" | "case_link" | "ship_alt" | "alt_delivered" | "send_label" | "close_case"
  // "İade gelecek": müşteri iadeyi telefonla bildirdi → yönetici talep açar; kod gerekmiyorsa doğrudan yolda
  | "return_expected" | "return_in_transit"
  // "Paket hazır" akışı (src/app/api/admin/orders/ship-flow)
  | "packed" | "picked_up" | "mp_picking" | "hb_package" | "mp_return"
  // Trendyol iade talebi: onayla + işle (src/lib/marketplace/trendyol-claims.ts)
  | "mp_claim"
  // Müşteri iptali, "ödeme yaptım" ama havale onaylanmamıştı (src/lib/customer-cancel.ts)
  | "cancel_transfer_refunded" | "cancel_transfer_none"
  // Faturası kesilmiş, pazaryerine yüklenemedi → yeniden yükle (src/lib/marketplace-invoice.ts)
  | "mp_invoice_push";

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
  mp_invoice_error?: string | null;        // fatura pazaryerine yüklenemedi
  mp_invoice_sent_at?: string | null;
  parasut_pdf_path?: string | null;
  cargo_tracking_number?: string | null;
  mp_package_number?: string | null;       // Hepsiburada paket no (paketlenince)
  mp_claim_state?: string | null;          // Trendyol iade talebi: in_transit / arrived / accepted / disputed / done
  mp_claim_note?: string | null;           // "1 × ürün (beden) — sebep"
  shipped_at?: string | null;              // kargoya verildiği an (fatura 7 gün takibi)
  order_items?: { id?: string; quantity: number; returned_qty?: number | null; exchange_of?: string | null; unit_price?: number | string | null }[] | null;
  created_at?: string | null;
  fit_status?: string | null;      // trial · ok · exchange · return
  delivered_at?: string | null;
  open_case?: { kind: string; status: string; return_method?: string | null; label_sent_at?: string | null; iban?: string | null; iban_name?: string | null; iban_name_mismatch?: boolean | null; alt_kargo_error?: string | null } | null;
};

export const TRIAL_DAYS = 14;

/** Değişim / iade talebinin sebebi: müşteri sayfası kod yazar (small / big / other) → okunur metin (Telegram "Sebep: big", 2026-11-06) */
export function caseReasonLabel(r?: string | null): string {
  const m: Record<string, string> = { small: "Küçük geldi", big: "Büyük geldi", other: "Diğer" };
  return r ? m[r] ?? r : "";
}

/** Satış sonrası (oldu / değişim / iade) bu sistemden yürüyen site siparişi mi: sitede verilen; eski siteden aktarılıp kargosu
 *  buradan (Kargonomi / Basit Kargo) yapılan (2026-11-06); ya da aktarılmış olup TESLİMİ BU SİSTEMDE KAYDEDİLEN (delivered_at
 *  dolu — teslim aktarımdan sonra işlendi; elle kodlu gönderi ya da eski sitede "tamamlandı"ya geçen yeni sipariş; YH24395,
 *  2026-11-09). Aktarımdan önce teslim edilmiş eski siparişlerde delivered_at boş → dışarıda. Süre (14 gün) ayrıca denetlenir.
 *  Aynı kural: DB tetikleyicisi trg_orders_delivered (MIG 20261174), after-sale.ts, teslim e-postası. */
export function afterSaleHere(o: { channel?: string | null; import_source?: string | null; kargonomi_shipment_id?: string | null; kargonomi_tracking_code?: string | null; delivered_at?: string | null }): boolean {
  return (o.channel || "site") === "site" && (!o.import_source || !!(o.kargonomi_shipment_id || o.kargonomi_tracking_code || o.delivered_at));
}
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
  errors?: string[];      // siparişte entegrasyon hatası (orderErrors) → panoda "Hata aldı"
};

const SHIPPED = ["shipped", "delivered", "undelivered", "returned"];

// Sırada yalnız iade faturası kesmek var (Trendyol iadesi işlendi / iade geldi + ücret iade edildi / faturalı iptal).
// Panoda ayrı "İade faturası kesilecek" satırında sayılır, "Bekleyen sipariş işi"nde sayılmaz (kullanıcı 2026-11-03).
/** Ücret iadesi yapılacak (iade geldi / iptal edildi, para henüz iade edilmedi) — panoda ayrı satır (kullanıcı 2026-11-14) */
export function isRefundDue(s: NextStep) {
  return s.needsAction && s.actions.some((a) => a.key === "refund");
}

export function isReturnInvoiceDue(s: NextStep) {
  return s.needsAction && s.actions.length > 0 && s.actions.every((a) => a.key === "return_invoice" || a.key === "return_invoice_parasut");
}

/** "Paket hazır"da fatura kendiliğinden kesilir mi: bu sistemde açılan site siparişi ya da Paraşüt'e geçişten (UNINVOICED_SINCE)
 *  sonraki eski site siparişi (kullanıcı 2026-11-15: aktarılan YH siparişi paketlenince faturasız kalıyordu). Pazaryeri hariç. */
export function autoInvoiceHere(o: { channel?: string | null; import_source?: string | null; created_at?: string | null }) {
  if (o.import_source) return String(o.created_at || "") >= UNINVOICED_SINCE;
  return (o.channel || "site") === "site";
}

/** Kargolanmış, satış faturası kesilmemiş — panodaki "Faturası kesilmemiş" satırı (panodaki sayım sorgusuyla AYNI koşul) */
export function isUninvoicedShipped(o: any) {
  return o?.status !== "cancelled" && ["paid", "partial_refund"].includes(o?.payment_status)
    && ["shipped", "delivered"].includes(o?.shipment_status) && (o?.invoice_status || "pending") === "pending"
    && (((o?.channel || "site") === "site" && !o?.import_source) || String(o?.created_at || "") >= UNINVOICED_SINCE); // eski siteden aktarılan yeni siparişler dahil
}

// Sırada yalnız satış faturası var (yanındaki "İade gelecek / İade al / müşteri adına talep" isteğe bağlı düğmeler iş değil)
const INVOICE_KEYS: string[] = ["invoice_parasut", "invoice"];
const SIDE_KEYS: string[] = ["return_expected", "return", "case_link"];
export function isInvoiceOnlyStep(s: NextStep) {
  return s.needsAction && s.actions.some((a) => INVOICE_KEYS.includes(a.key)) && s.actions.every((a) => INVOICE_KEYS.includes(a.key) || SIDE_KEYS.includes(a.key));
}

// Panodaki "Bekleyen sipariş işi" = kendi satırı olan işler HARİÇ (ücret iadesi / iade faturası / süren değişim /
// kargolanmış siparişin faturası — o "Faturası kesilmemiş" satırında; 2026-11-14 YH24765 iki satırda birden sayılıyordu).
// Pano sayısı ve sipariş listesindeki ?todo=diger aynı kuralı kullanır: tıklayınca yalnız o işler açılır (kullanıcı 2026-11-14).
export function isGeneralOrderTodo(s: NextStep, hasOpenExchange: boolean, uninvoicedShipped = false) {
  if (s.errors?.length) return true; // hata alan sipariş her durumda "Hata aldı"da
  return s.needsAction && !isRefundDue(s) && !isReturnInvoiceDue(s) && (!hasOpenExchange || isExchangeShipDue(s)) && !(uninvoicedShipped && isInvoiceOnlyStep(s));
}
/** Değişimde SIRA YÖNETİCİDE (kullanıcı 2026-11-27: "süren değişimde ben bir şey yapmıyorum" — müşteri / kargo beklenirken
 *  "Süreçte"; senin adımın gelince üstte "Değişim — senin adımın"). Gönderilecek ürün "Sevk edilecek"te, hata "Hata aldı"da. */
export function isExchangeMyStep(s: NextStep, hasOpenExchange: boolean) {
  return hasOpenExchange && s.needsAction && !s.errors?.length && !isExchangeShipDue(s);
}
/** Değişimde gönderilecek ürün var (talep geldi / stok girince ayrıldı) → sipariş gibi "Sevk edilecek" işi (kullanıcı 2026-11-26) */
export function isExchangeShipDue(s: NextStep) {
  return s.needsAction && s.actions.some((a) => a.key === "ship_alt");
}

// İŞ TÜRÜ (kullanıcı 2026-11-25: "Bekleyen sipariş işi"nde ödeme bekleyen, sevk edilecek ve faturası kesilemeyen siparişler
// aynı grupta duruyordu). Pano satırları + liste süzgeci (?todo=odeme|sevk|fatura|diger) + listedeki "yapılacak iş" yazısı.
// Fatura satırı: bu türdeki genel işler + kargolanmış faturası kesilmemiş (isUninvoicedShipped) — eski "Faturası kesilmemiş" satırı.
export type TodoKind = "error" | "payment" | "ship" | "invoice" | "other";
export const TODO_KINDS: { kind: TodoKind; label: string; param: string }[] = [
  { kind: "error", label: "Hata aldı", param: "hata" },
  { kind: "payment", label: "Ödeme beklenen", param: "odeme" },
  { kind: "ship", label: "Sevk edilecek", param: "sevk" },
  { kind: "invoice", label: "Fatura kesilecek", param: "fatura" },
  { kind: "other", label: "İade / talep / diğer", param: "diger" },
];
const PAY_KEYS: string[] = ["mark_paid", "cancel_transfer_refunded", "cancel_transfer_none"];
const PREP_KEYS: string[] = ["packed", "ship_kargonomi", "ship_manual", "hb_package", "mp_picking"];
export function todoKind(s: NextStep): TodoKind {
  if (s.errors?.length) return "error"; // hata her işin önünde (siparişe tıklayınca hata sıradaki adımda)
  const k = s.actions.map((a) => a.key as string);
  if (k.some((x) => PAY_KEYS.includes(x))) return "payment";
  // Paket hazır, fatura kesilemedi ("Kurye aldı" yanında olsa da önce fatura) → fatura; paketleme / kargo işi varsa sevk
  if (k.some((x) => INVOICE_KEYS.includes(x)) && !k.some((x) => PREP_KEYS.includes(x))) return "invoice";
  if (k.some((x) => PREP_KEYS.includes(x) || x === "picked_up" || x === "ship_alt")) return "ship";
  return "other";
}

export function isMarketplaceOrder(o: OrderLike) {
  return (o.channel || "site") !== "site" && !o.import_source;
}

/** Geri gelen ÜCRETLİ adet: değişim çiftinde (asıl + exchange_of ile bağlı alternatif) ücretsiz giden adet kadar geri gelen
 *  düşülür. Kalemlerde id / exchange_of yoksa (liste sorgusu) her kalem kendi başına sayılır. */
/** KISMİ İADEDE iade edilmesi gereken tutar (kullanıcı 2026-11-18: kısmi iadenin ücreti iade edildiği halde panoda
 *  "Ücret iadesi yapılacak" kalıyordu — kural "kalan tutar > 0" idi, oysa kalan tutar tutulan ürünün parası).
 *  Geri gelen ücretli adetlerin fiyatı × (sipariş tutarı / ürün tutarı, en çok 1 → kupon / indirim payı düşer).
 *  Fiyat bilinmiyorsa null (çağıran: daha önce hiç ücret iadesi yapılmadıysa yapılacak sayar). */
export function returnedRefundTarget(o: Pick<OrderLike, "order_items" | "total_amount">): number | null {
  const items = o.order_items;
  if (!items?.length || items.some((i) => i.unit_price == null)) return null;
  const ids = new Set(items.map((i) => i.id).filter(Boolean));
  const groups = new Map<string, { price: number; qty: number; returned: number; free: number }>();
  items.forEach((i, k) => {
    const alt = !!(i.exchange_of && ids.has(i.exchange_of));
    const root = alt ? String(i.exchange_of) : (i.id || `#${k}`);
    const g = groups.get(root) || { price: 0, qty: 0, returned: 0, free: 0 };
    g.returned += Number(i.returned_qty || 0);
    if (alt) g.free += Number(i.quantity || 0);
    else { g.price = Number(i.unit_price || 0); g.qty += Number(i.quantity || 0); }
    groups.set(root, g);
  });
  let gross = 0, ret = 0;
  for (const g of groups.values()) { gross += g.price * g.qty; ret += g.price * Math.max(0, g.returned - g.free); }
  if (gross <= 0) return null;
  const ratio = Math.min(1, Number(o.total_amount || 0) / gross);
  return Math.round(ret * ratio * 100) / 100;
}

export function paidReturnedUnits(items: OrderLike["order_items"]): number {
  if (!items?.length) return 0;
  const ids = new Set(items.map((i) => i.id).filter(Boolean));
  const groups = new Map<string, { returned: number; free: number }>();
  items.forEach((i, k) => {
    const root = i.exchange_of && ids.has(i.exchange_of) ? i.exchange_of : (i.id || `#${k}`);
    const g = groups.get(root) || { returned: 0, free: 0 };
    g.returned += Number(i.returned_qty || 0);
    if (i.exchange_of && ids.has(i.exchange_of)) g.free += Number(i.quantity || 0);
    groups.set(root, g);
  });
  let n = 0;
  for (const g of groups.values()) n += Math.max(0, g.returned - g.free);
  return n;
}

// SİPARİŞTEKİ HATALAR (kullanıcı 2026-11-26: Trendyol fatura yükleme hatası siparişin içinde kaldı, panoda görünmedi).
// Bir entegrasyon adımı hata verip öyle kaldıysa sipariş panoda / listede "Hata aldı" işine düşer; hata düzelince
// (alan temizlenince / adım tamamlanınca) kendiliğinden çıkar. Paraşüt "retry" (bakım, kendiliğinden yeniden dener)
// ve Hepsiburada "paket numarası henüz yok" (bekleme) hata sayılmaz.
const HB_WAIT = "Hepsiburada paket numarası henüz yok";
export function orderErrors(o: OrderLike): string[] {
  const out: string[] = [];
  if (o.status === "cancelled") return out;
  const ship = o.shipment_status || "waiting";
  if (o.parasut_status === "error") out.push(`Paraşüt faturası: ${o.parasut_error || "kesilemedi"}`);
  const mp = o.channel === "hepsiburada" ? "Hepsiburada" : "Trendyol";
  if (o.mp_invoice_error && !o.mp_invoice_sent_at && o.parasut_pdf_path && !o.mp_invoice_error.startsWith(HB_WAIT))
    out.push(`${mp}'a fatura yüklenemedi: ${o.mp_invoice_error}`);
  if (o.channel === "trendyol" && o.mp_picking_error && !o.mp_picking_at && !SHIPPED.includes(ship))
    out.push(o.mp_picking_error);
  if (o.kargonomi_error && !SHIPPED.includes(ship) && !o.cargo_tracking_number && !o.kargonomi_tracking_code)
    out.push(`Kargo entegrasyonu: ${o.kargonomi_error}`);
  // Değişim gönderisi (talepteki ayrı gönderi, src/lib/exchange-shipping.ts) açılamadı / sorunlu
  if (o.open_case?.kind === "exchange" && o.open_case.alt_kargo_error) out.push(`Değişim gönderisi: ${o.open_case.alt_kargo_error}`);
  return out;
}

export function orderNextStep(o: OrderLike): NextStep {
  const step = baseNextStep(o);
  const errors = orderErrors(o);
  if (!errors.length) return step;
  // Fatura pazaryerine yüklenemediyse "yeniden yükle" düğmesi sıradaki adıma eklenir
  const push = o.mp_invoice_error && !o.mp_invoice_sent_at && o.parasut_pdf_path && !step.actions.some((a) => a.key === "mp_invoice_push")
    ? [{ key: "mp_invoice_push" as const, label: `${o.channel === "hepsiburada" ? "Hepsiburada" : "Trendyol"}'a yeniden yükle`, kind: "primary" as const }] : [];
  return { ...step, actions: [...push, ...step.actions], needsAction: true, errors };
}

function baseNextStep(o: OrderLike): NextStep {
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
    // Paraşüt bakımda / ulaşılamıyor (src/lib/parasut-invoice.ts PARASUT_RETRY_HOURS): sistem kendiliğinden yeniden dener →
    // yöneticiden iş yok (kullanıcı 2026-11-25: bakım sırasında "yapabileceğim bir şey yok" işleri listede duruyordu)
    if (ps === "retry") {
      return { ...r, stage: `${r.stage} — Paraşüt'e ulaşılamıyor`, hint: o.parasut_error || "Paraşüt bakımda; fatura 10 dakikada bir kendiliğinden yeniden deneniyor.",
        actions: r.actions.map((a) => (a.key === "invoice_parasut" ? { ...a, label: "Şimdi yeniden dene" } : a)), needsAction: false };
    }
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
  // Değişimde ücretsiz giden çiftin geri gelişi "iade" sayılmaz (ücret iadesi / iade faturası doğurmaz — 2026-11-14)
  const someReturned = ship === "returned" || paidReturnedUnits(items) > 0;
  const allReturned = ship === "returned" || (!!items?.length && items.every((i) => Number(i.returned_qty || 0) >= Number(i.quantity)));
  const invoiceAction: NextAction = { key: "invoice", label: "Fatura kesildi", kind: "primary" };
  // Paraşüt açıksa ilk düğme (kapalıysa sipariş ekranı gizler)
  const invoiceActs: NextAction[] = [{ key: "invoice_parasut", label: "Faturayı kes (Paraşüt)", kind: "primary" }, invoiceAction];
  const packedAction: NextAction = { key: "packed", label: "Paket hazır", kind: "primary" };
  // İade faturası: Paraşüt açıksa ve satış faturası oradan kesildiyse ilk düğme (değilse sipariş ekranı gizler), sonra elle işaret
  const returnInvoiceActs: NextAction[] = [{ key: "return_invoice_parasut", label: "İade faturasını kes (Paraşüt)", kind: "primary" }, { key: "return_invoice", label: "İade faturası kesildi", kind: "primary" }];

  // ── Pazaryeri: durumları pazaryeri yönetir ──
  if (isMarketplaceOrder(o)) {
    if (o.status === "cancelled") return { stage: "İptal edildi (pazaryeri)", actions: [], needsAction: false };
    // Trendyol iade talebi (kısmi iade dahil; kullanıcı kararı 2026-10-31: iade siteden onaylanır)
    const cs = o.mp_claim_state;
    const cn = o.mp_claim_note ? `${o.mp_claim_note}. ` : "";
    if (cs === "arrived") {
      return { stage: "İade depoya ulaştı (Trendyol)", hint: `${cn}Ürünü kontrol et: sağlamsa onayla — Trendyol'a onay gider, iade gelen ürün cirodan düşer. Sorunluysa Trendyol panelinden reddet (48 saat içinde işlem yapılmazsa Trendyol kendiliğinden onaylar).`,
        actions: [{ key: "mp_claim", label: "İadeyi onayla", kind: "danger" }], needsAction: true };
    }
    if (cs === "accepted") {
      return { stage: "İade onaylandı (Trendyol)", hint: `${cn}Trendyol'da onaylanmış — sitede işle (stok + ciro).`,
        actions: [{ key: "mp_claim", label: "İade geldi — işle", kind: "danger" }], needsAction: true };
    }
    if (cs === "in_transit") return { stage: "İade yolda (Trendyol)", hint: `${cn}Ürün depoya ulaşınca “İadeyi onayla” çıkar.`, actions: [], needsAction: false };
    if (cs === "disputed") return { stage: "İade itirazda (Trendyol)", hint: `${cn}Trendyol inceliyor.`, actions: [], needsAction: false };
    if (cs === "done" && inv === "invoiced") {
      return { stage: "İade faturası kesilecek", hint: `${cn}İade işlendi; “İade faturasını kes (Paraşüt)” — ya da Paraşüt'te elle kesip “İade faturası kesildi”.`,
        actions: returnInvoiceActs, needsAction: true };
    }
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
    // Müşteri iptali (2026-11-12): ücret iadesi işi — IBAN / kart bilgisi talepte (order_cases kind 'cancel')
    const cc = o.open_case?.kind === "cancel" ? o.open_case : null;
    const toIban = cc?.iban ? `${cc.iban}${cc.iban_name ? ` (${cc.iban_name})` : ""}${cc.iban_name_mismatch ? " — DİKKAT: IBAN sahibi siparişteki adla uyuşmuyor, göndermeden önce doğrula" : ""}` : "";
    if (cc?.status === "check_transfer") {
      return { stage: "Müşteri iptal etti — ödediğini söylüyor", hint: `Havale onaylanmamıştı. Hesaba ₺${Number(o.total_amount || 0).toFixed(2)} geldiyse IBAN'a iade et: ${toIban}`,
        actions: [{ key: "cancel_transfer_refunded", label: "Havale gelmişti — iadeyi gönderdim", kind: "primary" }, { key: "cancel_transfer_none", label: "Havale gelmemiş", kind: "danger" }], needsAction: true };
    }
    if (paid && remaining > 0) return { stage: cc ? "Müşteri iptal etti — ücret iadesi" : "İptal edildi",
      hint: cc ? (toIban ? `₺${remaining.toFixed(2)} iadeyi IBAN'a gönder: ${toIban} — sonra “Ücret iadesi yap” → Havale.` : "Kart iadesi otomatik yapılamadı: “Ücret iadesi yap” → iyzico (yeniden dener) ya da iyzico panelinden yapıp işaretle.") : "Ücret iadesi kaydı eksik.",
      actions: [{ key: "refund", label: "Ücret iadesi yap", kind: "danger" }], needsAction: true };
    if (inv === "invoiced") return { stage: "İptal edildi", hint: "Fatura kesilmişti: iade faturası kes.", actions: returnInvoiceActs, needsAction: true };
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
        ? { stage: "Kargo entegrasyonu: gönderi oluşturulamadı", hint: o.kargonomi_error, actions: [
            { key: "ship_kargonomi", label: "Kargo — iptal et / yeniden teklif", kind: "primary" },
            { key: "ship_manual", label: "Kargoya verildi (elle)", kind: "primary" },
          ], needsAction: true }
        : { stage: `Kargo kodu bekleniyor${firm}`, hint: late
            ? "1 saattir kod gelmedi — kargo panelinden kontrol et."
            : "Kod gelince siparişe yazılır (dakikada bir sorgulanır); sonra etiketi bas — sipariş kendiliğinden “Kargo hazırlandı” olur.",
          actions: [{ key: "ship_kargonomi", label: "Kargo durumu", kind: "primary" }], needsAction: late };
    }
    // Paket hazır → kurye bekleniyor (müşteriye e-posta "Kurye aldı"da gider; listede toplu düğme)
    if (o.packed_at) {
      // Fatura sevkiyatta (C2, 2026-11-14): paket hazır anında kendiliğinden kesilir; kesilmediyse (Paraşüt kapalı / hata)
      // burada iş olarak görünür. Eski siteden aktarılan sipariş: Paraşüt'e geçişten sonrakiler dahil (autoInvoiceHere).
      if (autoInvoiceHere(o) && inv === "pending") {
        return { stage: "Paket hazır — fatura kesilecek", hint: "Fatura paket hazır anında kendiliğinden kesilir; kesilmediyse (Paraşüt kapalı / hata) kes ya da Paraşüt'te kesip “Fatura kesildi” de. PDF “Kargoya verildi” e-postasının ekinde gider.",
          actions: [...invoiceActs, { key: "picked_up", label: "Kurye aldı", kind: "primary" }, { key: "cancel", label: "Siparişi iptal et + para iadesi", kind: "danger" }], needsAction: true };
      }
      // Entegrasyonla gelen kod: kurye alınca kargo firmasının durumu siparişi kendiliğinden Kargoda yapar (saatlik sorgu)
      const auto = !!o.kargonomi_tracking_code;
      // Entegrasyonda yöneticiden iş yok (kullanıcı 2026-11-04): "Kurye aldı" düğmesi yalnız 2 gün geçip kargo firması
      // paketi hâlâ okutmadıysa (yedek) çıkar
      const late = daysSince(o.packed_at) > (auto ? 2 : 1);
      return auto
        ? { stage: late ? "Kargo hazırlandı — kargo firması 2 gündür almadı" : "Kargo hazırlandı — kargo firması bekleniyor",
            hint: late
              ? "Kargo firması paketi okutmadı. Paket gittiyse “Kurye aldı” (müşteriye e-posta gider); gitmediyse kargo firmasıyla görüş."
              : "Senden iş yok: kargo firması paketi okutunca sipariş kendiliğinden “Kargoda” olur, müşteriye e-posta gider.",
            actions: [
              ...(late ? [{ key: "picked_up", label: "Kurye aldı", kind: "primary" } as NextAction] : []),
              { key: "cancel", label: "Siparişi iptal et + para iadesi", kind: "danger" },
            ], needsAction: late }
        : { stage: "Kargo hazırlandı — kurye bekleniyor", hint: "Kurye alınca “Kurye aldı” — müşteriye kargo e-postası o an gider.", actions: [
            { key: "picked_up", label: "Kurye aldı", kind: "primary" },
            { key: "cancel", label: "Siparişi iptal et + para iadesi", kind: "danger" },
          ], needsAction: late };
    }
    const hasCode = !!(o.kargonomi_tracking_code || o.cargo_tracking_number);
    return { stage: o.kargonomi_shipment_id && !hasCode ? "Hazırlanıyor — kargo firması seçilmedi" : "Hazırlanıyor",
      hint: o.kargonomi_tracking_code ? "Etiketi bas — sipariş kendiliğinden “Kargo hazırlandı” olur." : hasCode ? "Etiketi bas, paketi hazırla, “Paket hazır” de." : "Kargo kodunu al (Kargoya ver ya da etiket kutusundan elle), etiketi bas, “Paket hazır” de.", actions: [
      ...(hasCode ? [] : [{ key: "ship_kargonomi", label: o.kargonomi_shipment_id ? "Kargo firmasını seç" : "Kargoya ver", kind: "primary" } as NextAction]),
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
      if (c.status === "requested") return { stage: "İade talebi", hint: "İade kodunu al (Basit Kargo ile gönderildiyse talepte “Basit Kargo'dan al”), kodu gir — müşteriye e-postayla gider. Müşteri kendisi gönderiyorsa “Kod gerekmiyor”.", actions: [
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
    // Adlar (kullanıcı 2026-11-26): "Müşteride kalacak" / "Geri gelecek" ürün; geri gönderilen ürün gelince "Geri gelen ürün ulaştı"
    // — müşteri seçmeden de gelebilir (YH25047), kargodaki / denenen aşamada da çıkar. İkisi de geri gelirse değişim iadeye döner.
    const back: NextAction = { key: "return", label: "Geri gelen ürün ulaştı", kind: "danger" };
    switch (c.status) {
      case "requested": return { stage: "Değişim talebi", hint: "İstenen numarayı gönder.", actions: [{ key: "ship_alt", label: "Alternatifi gönder", kind: "primary" }, close], needsAction: true };
      case "waiting_stock": return { stage: "Değişim — stok bekleniyor", hint: "Müşteri istediği numaranın gelmesini bekliyor. Stoğa girince 1 adet kendiliğinden bu değişime ayrılır ve “Sevk edilecek” işi düşer.", actions: [{ key: "ship_alt", label: "Alternatifi gönder", kind: "primary" }, close], needsAction: false };
      case "reserved": return { stage: "Değişim gönderilecek — stok ayrıldı", hint: "İstenen numara stoğa girdi, 1 adet bu değişime ayrıldı (stoktan düştü). Kargola, takip numarasını yaz, “Alternatifi gönder” — müşteriye e-posta gider.", actions: [{ key: "ship_alt", label: "Alternatifi gönder", kind: "primary" }, close], needsAction: true };
      case "alt_shipped": return { stage: "Değişim — alternatif kargoda", actions: [{ key: "alt_delivered", label: "Alternatif teslim edildi", kind: "primary" }, back], needsAction: false };
      case "alt_delivered": return { stage: "Değişim — müşteri deniyor", hint: "Müşteri hangisinin olduğunu seçecek (e-postayla soruldu). Geri gönderdiği ürün seçimden önce geldiyse “Geri gelen ürün ulaştı”.", actions: [{ key: "case_link", label: "Müşteri adına seç", kind: "primary" }, back], needsAction: false };
      case "none_fit": return { stage: "Değişim — ikisi de olmadı", hint: "Müşterinin notunu oku, müşteriyle konuş (iade mi, başka numara mı). Geri gönderim kodu gönder; ürünler gelince “Geri gelen ürün ulaştı” (ikisi de gelirse ücret iadesi sırası).", actions: [{ key: "send_label", label: "Geri gönderim kodunu gönder", kind: "primary" }, back, close], needsAction: true };
      case "keep_chosen": return { stage: "Değişim — müşteri seçti", hint: "Geri gelecek ürün için kargo kodu gönder.", actions: [{ key: "send_label", label: "Geri gönderim kodunu gönder", kind: "primary" }, back], needsAction: true };
      default: return { stage: "Değişim — geri gelecek ürün yolda", hint: upsHint ?? "Ürün gelince “Geri gelen ürün ulaştı” (stoğa ekle, para iadesi yok).", actions: [back, { key: "send_label", label: "Kodu değiştir / yeniden gönder", kind: "primary" }], needsAction: upsLate };
    }
  }

  // Kargodan sonra: iade geldiyse önce para iadesi + iade faturası
  if (someReturned) {
    const acts: NextAction[] = [];
    // Hepsi geri geldiyse kalan tutarın tamamı iade edilir; kısmi iadede yalnız geri gelen ürünlerin tutarı (1 TL pay)
    const refunded = Number(o.refunded_amount || 0);
    const target = allReturned ? null : returnedRefundTarget(o);
    const owes = allReturned ? remaining > 0 : target != null ? refunded + 1 < target : refunded === 0;
    if (paid && remaining > 0 && owes) acts.push({ key: "refund", label: "Ücret iadesi yap", kind: "danger" });
    if (!allReturned) acts.push({ key: "return", label: "İade al", kind: "danger" });
    if (inv === "invoiced" && (pay === "refunded" || pay === "partial_refund")) acts.push(...returnInvoiceActs);
    if (inv === "pending" && !allReturned) acts.push(...invoiceActs);
    const due = acts.some((a) => a.key === "refund" || a.key === "return_invoice");
    const refundDue = acts.some((a) => a.key === "refund");
    // İadenin son adımı: faturası kesilmiş siparişte para iade edildiyse iade faturası kesilir
    const onlyInvoice = !refundDue && acts.some((a) => a.key === "return_invoice");
    return {
      stage: onlyInvoice ? "İade faturası kesilecek" : allReturned ? "İade geldi" : "Kısmi iade geldi",
      hint: refundDue ? "İade gelen ürünün ücretini iade et." : onlyInvoice ? "Ücret iade edildi; “İade faturasını kes (Paraşüt)” — ya da Paraşüt'te elle kesip “İade faturası kesildi”." : undefined,
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
      ...(afterSaleHere(o) ? [{ key: "case_link", label: "Müşteri adına değişim / iade aç", kind: "primary" } as NextAction] : []),
      { key: "return", label: "İade al", kind: "danger" },
    ], needsAction: false };
  }

  // Teslim edildi (oldu / süre doldu / eski sipariş)
  const acts: NextAction[] = [];
  if (inv === "pending") acts.push(...invoiceActs);
  if (ship === "delivered") acts.push({ key: "return_expected", label: "İade gelecek", kind: "danger" });
  // Müşteri (e-posta / telefon) değişim istedi → müşteri sayfasını onun adına doldur. Süre sınırı YOK (kullanıcı 2026-11-26:
  // yardım için her zaman açık; "oldu" denmiş / değişimi bitmiş siparişte de) — yönetici bağlantısı (afterSaleAdminUrl)
  if (ship === "delivered" && afterSaleHere(o))
    acts.push({ key: "case_link", label: "Müşteri adına değişim / iade aç", kind: "primary" });
  acts.push({ key: "return", label: "İade al", kind: "danger" });
  const silent = o.fit_status === "trial"; // 14 gün doldu, müşteri cevap vermedi → fatura otomatik DEĞİL, yönetici onaylar
  return inv === "pending"
    ? { stage: silent ? `${TRIAL_DAYS} gün doldu, cevap yok — fatura kesilsin mi?` : o.fit_status === "ok" ? "Oldu — fatura kesilecek" : "Teslim edildi",
        hint: silent ? "Müşteri oldu / değişim / iade demedi. Uygunsa faturayı kes (PDF müşteriye e-postayla gider)." : "Fatura kendiliğinden kesilmediyse (Paraşüt kapalı / hata) kes.",
        actions: acts, needsAction: true }
    : { stage: "Tamamlandı", actions: acts, needsAction: false };
}

// ── Deneme hatırlatması (src/lib/trial-reminder.ts; kullanıcı 2026-11-11) ──────────────────────────────────────────
/** Teslimden kaç gün sonra "oldu mu?" hatırlatması */
export const REMIND_AFTER_DAYS = 4;
/** Son 2 günde hatırlatma anlamsız (ör. sonradan teslim işaretlenen eski sipariş) */
export const REMIND_MIN_LEFT_DAYS = 2;

/** Hatırlatma bu siparişe şimdi gitmeli mi? (saf — regresyon) */
export function trialReminderDue(o: {
  channel?: string | null; import_source?: string | null; kargonomi_shipment_id?: string | null; kargonomi_tracking_code?: string | null;
  status?: string | null; shipment_status?: string | null; fit_status?: string | null; delivered_at?: string | null; trial_reminded_at?: string | null;
  has_open_case?: boolean;
}, now = Date.now()): boolean {
  if (o.trial_reminded_at || o.fit_status !== "trial" || o.shipment_status !== "delivered" || o.status === "cancelled" || o.has_open_case) return false;
  if (!afterSaleHere(o) || !o.delivered_at) return false;
  const DAY = 86400_000;
  const age = now - new Date(o.delivered_at).getTime();
  return age >= REMIND_AFTER_DAYS * DAY && age <= (TRIAL_DAYS - REMIND_MIN_LEFT_DAYS) * DAY;
}


