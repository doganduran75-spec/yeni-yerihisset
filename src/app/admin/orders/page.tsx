"use client";

import { orderLabel } from "@/lib/order-label";
import { useEffect, useState, useCallback } from "react";
import { orderNextStep, type NextActionKey } from "@/lib/order-next-step";
import { useSearchParams, useRouter } from "next/navigation";
import AdminOpsTabs from "@/components/admin/AdminOpsTabs";
import OrderTimeline from "@/components/admin/OrderTimeline";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase";
import { shipFee } from "@/lib/shipping-fee";
import { siteAlert, siteConfirm } from "@/components/ui/site-dialog";
import { GeoSelect } from "@/components/ui/geo-select";
import { CITIES, DISTRICTS } from "@/lib/turkey-geo";
import {
  Eye, MoreVertical, Loader2, Package, Truck, CheckCircle, XCircle,
  MapPin, Phone, Mail, ShoppingBag, Copy, ExternalLink,
  Landmark, FileText, ChevronDown, AlertCircle, Send, Search, Fingerprint, Building2, UserPlus, Trash2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type OrderItem = {
  id: string;
  quantity: number;
  unit_price: number;
  product_id: string | null;
  title?: string | null;            // pazaryeri kaleminde ürün adı (anlık görüntü)
  barcode?: string | null;
  external_status?: string | null;
  stock_applied_at?: string | null;
  stock_restored_at?: string | null;
  returned_qty?: number | null;     // iade gelen adet
  restocked_qty?: number | null;    // stoğa geri eklenen adet
  variant_id?: string | null;
  sku?: string | null;
  variant_name?: string | null;
  products: { title: string } | null;
};

// Sıradaki adım + açık satış sonrası talep (order_cases — src/lib/after-sale.ts)
const openCaseOf = (o: any) => ((o?.order_cases as any[]) || []).find((c) => !c.closed_at) ?? null;
const nx = (o: any) => orderNextStep({ ...o, open_case: openCaseOf(o) });

// Siparişin geldiği reklam/kampanya (orders.attribution.source — src/lib/ad-context.ts)
function adSourceLabel(o: { attribution?: { source?: Record<string, unknown> } | null }): string | null {
  const s = o.attribution?.source;
  if (!s) return null;
  const src = String(s.utm_source || "").toLowerCase();
  const base = s.fbclid || /instagram|facebook|^fb$|^ig$|meta/.test(src)
    ? (/instagram|^ig$/.test(src) ? "Instagram reklamı" : /facebook|^fb$/.test(src) ? "Facebook reklamı" : "Meta reklamı")
    : s.gclid ? "Google reklamı"
    : s.utm_source ? String(s.utm_source) : null;
  if (!base) return null;
  return [base, s.utm_campaign, s.utm_content].filter(Boolean).join(" · ");
}

type Order = {
  id: string;
  order_number?: number | null;
  total_amount: number;
  status: string;
  created_at: string;
  shipping_address: string;
  billing_address?: string | null;
  user_id: string;
  payment_method?: string | null;
  payment_status?: string | null;
  shipment_status?: string | null;
  invoice_status?: string | null;
  kargonomi_tracking_code?: string | null;
  kargonomi_shipment_id?: string | null;
  iyzico_payment_id?: string | null;
  refund_status?: string | null;
  refunded_amount?: number | null;
  refund_method?: string | null;
  shipping_method?: string | null;
  shipping_cost?: number | null;
  coupon_discount?: number | null;
  credit_used?: number | null;
  affiliate_profiles?: { code: string } | null;
  attribution?: { source?: Record<string, unknown>; capi?: { status?: string; error?: string; reason?: string; test?: boolean } } | null;
  // Pazaryeri siparişi (Trendyol / Hepsiburada)
  channel?: string | null;
  external_order_number?: string | null;
  external_status?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  cargo_provider?: string | null;
  cargo_tracking_number?: string | null;
  cargo_tracking_url?: string | null;
  mp_warning?: string | null;
  mp_warning_ack?: boolean | null;
  stock_reduced_at?: string | null;
  // Eski siteden (WooCommerce) aktarılan sipariş
  import_source?: string | null;
  import_ref?: string | null;
  extra_fee?: number | null;
  customer_note?: string | null;
  external_raw?: any;
  profiles: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    email_verified?: boolean | null;
  } | null;
  order_items?: OrderItem[];
};

// ─── Ödeme Durumu ─────────────────────────────────────────────────────────────

const paymentColors: Record<string, string> = {
  pending:  "bg-amber-50  text-amber-700  ring-amber-500/20",
  paid:     "bg-green-50  text-green-700  ring-green-500/20",
  failed:   "bg-red-50    text-red-700    ring-red-500/20",
  partial_refund: "bg-orange-50 text-orange-700 ring-orange-500/20",
  refunded: "bg-slate-100 text-slate-700 ring-slate-500/20",
};
const paymentLabels: Record<string, string> = {
  pending: "Bekleniyor",
  paid:    "Ödendi",
  failed:  "Alınmadı",
  partial_refund: "Kısmi iade",
  refunded: "İade edildi",
};
const REFUND_METHOD_LABEL: Record<string, string> = {
  iyzico: "iyzico", bank_transfer: "Havale/EFT", cash: "Kapıda / nakit", marketplace: "Pazaryeri", other: "Diğer",
};

// ─── Sevkiyat Durumu ──────────────────────────────────────────────────────────

const shipmentColors: Record<string, string> = {
  waiting:    "bg-slate-50   text-slate-500  ring-slate-400/20",
  preparing:  "bg-blue-50    text-blue-700   ring-blue-500/20",
  shipped:    "bg-purple-50  text-purple-700 ring-purple-500/20",
  delivered:  "bg-green-50   text-green-700  ring-green-500/20",
  cancelled:  "bg-red-50     text-red-700    ring-red-500/20",
  undelivered: "bg-orange-50 text-orange-700 ring-orange-500/20",
  returned:   "bg-amber-50   text-amber-700  ring-amber-500/20",
};
const shipmentLabels: Record<string, string> = {
  waiting:   "Bekleniyor",
  preparing: "Hazırlanıyor",
  shipped:   "Kargoya Verildi",
  delivered: "Teslim Edildi",
  cancelled: "İptal Edildi",
  undelivered: "Teslim Edilemedi",
  returned:  "İade geldi",
};

// ─── Satış kanalı (sales_channels tablosu: YeriHisset, Attipas, Trendyol, Hepsiburada…) ──
type SalesChannel = { code: string; label: string; color: string; kind: string; is_active: boolean };
const CHANNEL_FALLBACK: SalesChannel[] = [
  { code: "site", label: "YeriHisset", color: "#475569", kind: "site", is_active: true },
  { code: "attipas", label: "Attipas", color: "#db2777", kind: "legacy", is_active: true },
  { code: "trendyol", label: "Trendyol", color: "#ea580c", kind: "marketplace", is_active: true },
  { code: "hepsiburada", label: "Hepsiburada", color: "#d97706", kind: "marketplace", is_active: true },
  { code: "amazon", label: "Amazon", color: "#0f172a", kind: "marketplace", is_active: true },
];
// Pazaryeri siparişi: ödeme/sevkiyat pazaryerinden gelir (salt okunur). Eski siteden
// aktarılan siparişler (Attipas dahil) pazaryeri sayılmaz; site siparişi gibi yönetilir.
const isMarketplace = (o?: { channel?: string | null; import_source?: string | null } | null) =>
  !!o?.channel && o.channel !== "site" && !o.import_source;
const isImported = (o?: { import_source?: string | null } | null) => !!o?.import_source;
function ChannelBadge({ code, channels, size = "sm" }: { code?: string | null; channels: SalesChannel[]; size?: "sm" | "md" }) {
  if (!code || code === "site") return null;
  const ch = channels.find((c) => c.code === code);
  const color = ch?.color || "#64748b";
  return (
    <span
      className={`font-sans font-black uppercase rounded ${size === "md" ? "text-[10px] px-2 py-0.5" : "text-[9px] px-1.5 py-0.5"}`}
      style={{ backgroundColor: `${color}1f`, color }}
    >
      {ch?.label ?? code}
    </span>
  );
}

// ─── Fatura Durumu ────────────────────────────────────────────────────────────

const invoiceColors: Record<string, string> = {
  pending:  "bg-slate-50  text-slate-500  ring-slate-400/20",
  invoiced: "bg-teal-50   text-teal-700   ring-teal-500/20",
  return_invoiced: "bg-slate-100 text-slate-700 ring-slate-500/20",
  not_required: "bg-slate-50 text-slate-400 ring-slate-300/20",
};
const invoiceLabels: Record<string, string> = {
  pending:  "Bekleniyor",
  invoiced: "Faturalandı",
  return_invoiced: "İade faturası kesildi",
  not_required: "Gerekmiyor",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);

  // SKU inline edit state: { [itemId]: { sku, title, saving, error } }
  const [skuEdits, setSkuEdits] = useState<Record<string, { sku: string; title: string; saving: boolean; error: string }>>({});

  // Admin notu
  const [adminNote, setAdminNote] = useState("");
  const [adminNoteSaving, setAdminNoteSaving] = useState(false);

  // Kargoya Ver dialog
  const [shipDialogOrder, setShipDialogOrder] = useState<Order | null>(null);
  const [desi, setDesi] = useState("2");
  const [shipping, setShipping] = useState(false);
  const [shipResult, setShipResult] = useState<{ tracking_code: string; label_url?: string | null } | null>(null);
  const [shipError, setShipError] = useState<string | null>(null);

  // ─── Yeni Sipariş state ───────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [customerAddresses, setCustomerAddresses] = useState<any[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [newItems, setNewItems] = useState([
    { sku: "", productId: "", variantId: "", variantName: "", title: "", quantity: 1, unitPrice: 0, stock: 0, query: "", skuError: "", skuLoading: false },
  ]);
  const [newPaymentMethod, setNewPaymentMethod] = useState("credit_card");
  // Kargo: sitedeki aktif kargo yöntemleri (checkout ile aynı kural; ücret sunucuda hesaplanır)
  const [shipMethods, setShipMethods] = useState<any[]>([]);
  const [newShipMethodId, setNewShipMethodId] = useState("");
  const [newFreeShipping, setNewFreeShipping] = useState(false); // admin kargo ücretini almayabilir
  // Hızlı müşteri ekleme (aramada bulunamazsa) — şifresiz üye + teslimat adresi
  const EMPTY_NEW_CUSTOMER = { firstName: "", lastName: "", email: "", phone: "", city: "", district: "", addressDetail: "" };
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState(EMPTY_NEW_CUSTOMER);
  const [newCustomerSaving, setNewCustomerSaving] = useState(false);
  const [newCustomerError, setNewCustomerError] = useState("");
  const [createdCustomerId, setCreatedCustomerId] = useState<string | null>(null); // bu pencerede eklenen
  const [sendActivation, setSendActivation] = useState(true);
  const [customerSearched, setCustomerSearched] = useState(""); // son aranan (sonuç yok mesajı için)
  const [newAdminNote, setNewAdminNote] = useState("");
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [createError, setCreateError] = useState("");
  const [skuDropdown, setSkuDropdown] = useState<{ idx: number; results: any[] } | null>(null);
  // Ürün (satılabilir birim) listesi — çok-kelimeli arama için Yeni Sipariş'te yüklenir
  const [orderUnits, setOrderUnits] = useState<any[]>([]);
  const EMPTY_ITEM = { sku: "", productId: "", variantId: "", variantName: "", title: "", quantity: 1, unitPrice: 0, stock: 0, query: "", skuError: "", skuLoading: false };

  // ─── iyzico İade state ────────────────────────────────────────────────────
  // Sipariş işlemleri (iptal / iade al / ücret iadesi) penceresi
  const [actionMode, setActionMode] = useState<null | "cancel" | "return" | "refund">(null);

  // ─── Liste: arama / süzgeç / sıralama / sayfalama ──────────────────────────
  const [q, setQ] = useState("");
  const [fPay, setFPay] = useState("all");
  const [fShip, setFShip] = useState("all");
  const [fInv, setFInv] = useState("all");
  const [fRet, setFRet] = useState("all"); // iade/iptal hazır filtreleri
  const [fTodo, setFTodo] = useState(false); // "Bekleyen işlerim": sıra yöneticide olanlar (order-next-step)
  const [fMethod, setFMethod] = useState("all");
  const [fChannel, setFChannel] = useState("all"); // sales_channels.code
  const [channels, setChannels] = useState<SalesChannel[]>(CHANNEL_FALLBACK);
  const [timelineTick, setTimelineTick] = useState(0); // sipariş geçmişini yenile
  const [sortKey, setSortKey] = useState<"no" | "customer" | "date" | "amount" | "pay" | "ship" | "inv">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [listPage, setListPage] = useState(0);

  useEffect(() => { fetchOrders(); }, []);

  // Yeni Sipariş diyaloğu açılınca satılabilir birimleri (stok dahil) yükle
  useEffect(() => {
    if (createOpen && orderUnits.length === 0) loadOrderUnits();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createOpen]);

  // URL'den ?id=xxx gelirse ilgili siparişi bir KEZ otomatik aç, sonra parametreyi
  // temizle. Aksi halde ?id= URL'de kalıcı olur ve menüye her tıklayışta / sayfa
  // yenilemede son sipariş tekrar açılırdı.
  useEffect(() => {
    const targetId = searchParams.get("id");
    if (!targetId || loading || orders.length === 0) return;
    const order = orders.find(o => o.id === targetId);
    if (order) handleViewDetails(order);
    router.replace("/admin/orders", { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loading, orders.length]);

  async function fetchOrders() {
    try {
      setLoading(true);
      (supabase as any).from("sales_channels").select("code, label, color, kind, is_active").order("sort_order")
        .then(({ data }: any) => { if (data?.length) setChannels(data); });
      // Sunucu tek seferde en fazla 1000 satır verir → sayfa sayfa hepsini al (aktarılan eski siparişler dahil)
      const all: any[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("orders")
          .select(`*, profiles(first_name, last_name, email, phone, email_verified), affiliate_profiles(code), order_cases(*)`)
          .order("created_at", { ascending: false })
          .range(from, from + 999);
        if (error) {
          const { data: simple } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
          setOrders((simple as any) || []);
          return;
        }
        all.push(...((data as any[]) || []));
        if (!data || data.length < 1000) break;
      }
      setOrders(all);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // ─── Durum güncelleme yardımcıları ────────────────────────────────────────

  async function updateField(orderId: string, fields: Record<string, string>) {
    setUpdatingId(orderId);
    try {
      const { error } = await (supabase.from("orders").update(fields as any).eq("id", orderId) as any);
      if (error) throw error;

      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...fields } : o));
      if (selectedOrder?.id === orderId) setSelectedOrder(prev => prev ? { ...prev, ...fields } : null);

      // İptal / başarısız ödeme → düşülen stoğu geri yükle (idempotent, no-op güvenli)
      const isCancel =
        fields.status === "cancelled" ||
        fields.shipment_status === "cancelled" ||
        fields.payment_status === "failed";
      if (isCancel) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          fetch("/api/admin/orders/restore-stock", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
            body: JSON.stringify({ orderId }),
          }).catch(() => {});
        });
      }

      // Bildirim tetikleyicileri
      const triggerMap: Record<string, string> = {
        paid:      "order_paid",
        shipped:   "order_shipped",
        delivered: "order_delivered",
        cancelled: "order_cancelled",
      };
      const order = orders.find(o => o.id === orderId);
      if (order?.user_id) {
        const trigger = triggerMap[fields.payment_status || ""] || triggerMap[fields.shipment_status || ""];
        if (trigger) {
          supabase.auth.getSession().then(({ data: { session } }) => {
            fetch("/api/notifications/send", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
              },
              body: JSON.stringify({ trigger, orderId, userId: order.user_id }),
            }).catch(() => {});
          });
        }
      }
    } catch (e) {
      console.error(e);
      alert("Güncelleme başarısız.");
    } finally {
      setUpdatingId(null);
    }
  }

  // Ödeme "Ödendi" yapıldığında sevkiyatı otomatik "Hazırlanıyor"'a al
  async function markPaymentPaid(orderId: string) {
    const order = orders.find(o => o.id === orderId);
    const shipStatus = order?.shipment_status === "waiting" ? "preparing" : order?.shipment_status;
    await updateField(orderId, {
      payment_status: "paid",
      ...(shipStatus ? { shipment_status: shipStatus } : {}),
      status: "processing",
    });
  }

  // ─── Detay görüntüleme ────────────────────────────────────────────────────

  async function saveAdminNote(orderId: string, note: string) {
    setAdminNoteSaving(true);
    await (supabase.from("orders").update({ admin_note: note } as any).eq("id", orderId) as any);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, admin_note: note } as any : o));
    setAdminNoteSaving(false);
  }


  // ─── Yeni Sipariş fonksiyonları ───────────────────────────────────────────

  async function searchCustomers(q: string) {
    // PostgREST or() söz dizimini bozacak karakterleri at
    const term = q.replace(/[,()*%\\]/g, " ").trim();
    if (term.length < 2) { setCustomerResults([]); setCustomerSearched(""); return; }
    const digits = term.replace(/\D/g, "");
    const parts = [`first_name.ilike.%${term}%`, `last_name.ilike.%${term}%`, `email.ilike.%${term}%`];
    if (digits.length >= 4) parts.push(`phone.ilike.%${digits}%`);
    // "Ad Soyad" yazıldıysa ad + soyad birlikte
    const [f, ...rest] = term.split(/\s+/);
    if (rest.length) parts.push(`and(first_name.ilike.%${f}%,last_name.ilike.%${rest.join(" ")}%)`);
    const { data } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email, phone")
      .or(parts.join(","))
      .is("deleted_at", null)
      .limit(8);
    setCustomerResults(data ?? []);
    setCustomerSearched(term);
  }

  // Aramada bulunamayan müşteriyi pencereden çıkmadan ekle ve seç
  function openNewCustomer() {
    const term = customerQuery.trim();
    const isEmail = term.includes("@");
    const digits = term.replace(/\D/g, "");
    const isPhone = !isEmail && digits.length >= 4;
    const [f, ...rest] = isEmail || isPhone ? [""] : term.split(/\s+/);
    setNewCustomer({
      ...EMPTY_NEW_CUSTOMER,
      firstName: f ?? "", lastName: rest.join(" "),
      email: isEmail ? term : "", phone: isPhone ? digits.slice(-10) : "",
    });
    setNewCustomerError("");
    setCustomerResults([]);
    setNewCustomerOpen(true);
  }

  async function saveNewCustomer() {
    setNewCustomerSaving(true);
    setNewCustomerError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/customers/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify(newCustomer),
      });
      const j = await res.json();
      if (!res.ok) { setNewCustomerError(j.error || "Müşteri eklenemedi"); return; }
      setNewCustomerOpen(false);
      setNewCustomer(EMPTY_NEW_CUSTOMER);
      setCreatedCustomerId(j.customer.id);
      setSendActivation(true);
      await selectCustomer(j.customer);
    } catch {
      setNewCustomerError("Bağlantı hatası");
    } finally {
      setNewCustomerSaving(false);
    }
  }

  async function selectCustomer(customer: any) {
    setSelectedCustomer(customer);
    setCustomerQuery(`${customer.first_name} ${customer.last_name}`);
    setCustomerResults([]);
    setCustomerSearched("");
    const { data: addrs } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("user_id", customer.id);
    setCustomerAddresses(addrs ?? []);
    setSelectedAddressId(addrs?.[0]?.id ?? "");
  }

  // Türkçe-duyarsız normalize (Yeni Sipariş ürün araması)
  function normTr(s: string): string {
    return (s || "").toLocaleLowerCase("tr-TR")
      .replaceAll("ı", "i").replaceAll("İ", "i").replaceAll("ş", "s")
      .replaceAll("ğ", "g").replaceAll("ü", "u").replaceAll("ö", "o").replaceAll("ç", "c");
  }

  // Satılabilir birimleri yükle (varyantlar + varyantsız ürünler), stok dahil
  async function loadOrderUnits() {
    const { data } = await (supabase as any)
      .from("products")
      .select("id, title, price, stock, has_variants, product_variants(id, sku, price, stock, variant_options(value, variant_groups(name)))")
      .eq("is_active", true)
      .order("title");
    const list: any[] = [];
    for (const p of (data as any[]) || []) {
      const vs = p.product_variants || [];
      if (vs.length > 0) {
        for (const v of vs) {
          const val = v.variant_options?.value ?? "";
          const gn = v.variant_options?.variant_groups?.name ?? "";
          const label = val ? (gn ? `${gn}: ${val}` : val) : "";
          list.push({
            productId: p.id, variantId: v.id, title: p.title, variantName: label,
            sku: v.sku ?? "", price: Number(v.price ?? 0), stock: Number(v.stock ?? 0),
            search: normTr([p.title, gn, val, v.sku].filter(Boolean).join(" ")),
          });
        }
      } else {
        list.push({
          productId: p.id, variantId: "", title: p.title, variantName: "",
          sku: "", price: Number(p.price ?? 0), stock: Number(p.stock ?? 0),
          search: normTr(p.title),
        });
      }
    }
    setOrderUnits(list);
  }

  function filterUnits(query: string): any[] {
    const tokens = normTr(query).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    return orderUnits.filter(u => tokens.every(t => u.search.includes(t))).slice(0, 12);
  }

  function selectUnit(idx: number, u: any) {
    setNewItems(prev => prev.map((item, i) => i === idx ? {
      ...item,
      productId: u.productId, variantId: u.variantId, variantName: u.variantName,
      title: u.title, sku: u.sku, unitPrice: u.price, stock: u.stock,
      quantity: Math.min(item.quantity || 1, u.stock > 0 ? u.stock : 1),
      query: "", skuError: "",
    } : item));
  }

  // Yeni sipariş penceresi açılınca aktif kargo yöntemlerini yükle
  useEffect(() => {
    if (!createOpen) return;
    (async () => {
      const { data } = await (supabase as any).from("shipping_methods").select("*").eq("is_active", true).order("is_default", { ascending: false }).order("sort_order");
      const list = (data as any[]) || [];
      setShipMethods(list);
      setNewShipMethodId((prev) => (prev && list.some((m) => m.id === prev)) ? prev : (list[0]?.id ?? ""));
    })();
  }, [createOpen]);

  async function submitNewOrder() {
    if (!selectedCustomer) { setCreateError("Müşteri seçin"); return; }
    if (!selectedAddressId) { setCreateError("Adres seçin"); return; }
    if (newItems.some(i => !i.productId)) { setCreateError("Tüm ürünleri listeden seçin"); return; }
    if (newItems.some(i => i.stock <= 0)) { setCreateError("Stokta olmayan ürünle sipariş girilemez. O satırı çıkarın."); return; }
    if (newItems.some(i => i.quantity > i.stock)) { setCreateError("Adet, stoktan fazla olamaz."); return; }
    setCreatingOrder(true);
    setCreateError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/orders/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          customer_id: selectedCustomer.id,
          shipping_address_id: selectedAddressId,
          items: newItems.map(i => ({
            product_id: i.productId,
            variant_id: i.variantId || null,
            variant_name: i.variantName,
            sku: i.sku,
            title: i.title,
            quantity: i.quantity,
            unit_price: i.unitPrice,
          })),
          payment_method: newPaymentMethod,
          shipping_method_id: newShipMethodId || null,
          free_shipping: newFreeShipping,
          send_activation: !!createdCustomerId && createdCustomerId === selectedCustomer.id && sendActivation,
          admin_note: newAdminNote,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setCreateError(json.error ?? "Hata oluştu"); return; }
      setCreateOpen(false);
      setCustomerQuery(""); setSelectedCustomer(null); setCustomerAddresses([]); setSelectedAddressId("");
      setNewItems([{ ...EMPTY_ITEM }]);
      setNewAdminNote(""); setNewPaymentMethod("credit_card"); setNewFreeShipping(false);
      setCreatedCustomerId(null); setNewCustomerOpen(false);
      await fetchOrders();
    } catch {
      setCreateError("Bağlantı hatası");
    } finally {
      setCreatingOrder(false);
    }
  }

  // Test siparişini KALICI sil (yalnız sitede verilmiş, aktarılmamış sipariş)
  const [deletingOrder, setDeletingOrder] = useState(false);
  async function deleteOrder(o: Order) {
    const label = orderLabel(o);
    const goodsLeft = ["shipped", "delivered", "undelivered", "returned"].includes(o.shipment_status || "");
    const paid = ["paid", "partial_refund"].includes(o.payment_status || "");
    const lines = [
      `${label} ve tüm kayıtları (ürünler, süreç geçmişi, mesajlar, komisyon) KALICI olarak silinir; ciro ve raporlardan düşer. Geri alınamaz.`,
      goodsLeft ? "Ürün kargolanmış görünüyor → stok geri EKLENMEZ." : "Düşülen stok geri eklenir.",
      "Kullanılan YeriHisset Kredisi cüzdana döner.",
      ...(paid ? ["⚠ Ödeme alınmış görünüyor: para iadesi YAPILMAZ."] : []),
      "Gerçek bir siparişi silme — iptal et.",
    ];
    if (!(await siteConfirm({ title: "Sipariş kalıcı olarak silinsin mi?", message: lines.join("\n"), confirmText: "Kalıcı olarak sil", tone: "danger" }))) return;
    setDeletingOrder(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/admin/orders/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ orderId: o.id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Silinemedi");
      setIsDetailsOpen(false);
      setSelectedOrder(null);
      setOrders((prev) => prev.filter((x) => x.id !== o.id));
      siteAlert({ message: `${label} silindi${j.restocked ? "; stok geri eklendi" : ""}.`, tone: "success" });
    } catch (e: any) {
      siteAlert({ title: "Silinemedi", message: e?.message || "Silinemedi", tone: "danger" });
    } finally {
      setDeletingOrder(false);
    }
  }

  async function handleViewDetails(order: Order) {
    setSelectedOrder(order);
    setIsDetailsOpen(true);
    setItemsLoading(true);
    setSkuEdits({});
    setAdminNote((order as any).admin_note ?? "");
    setActionMode(null);
    try {
      const { data } = await supabase
        .from("order_items")
        .select("id, quantity, unit_price, product_id, variant_id, sku, variant_name, title, barcode, external_status, stock_applied_at, stock_restored_at, returned_qty, restocked_qty, exchange_of, products(title)")
        .eq("order_id", order.id);
      const items = (data as any[]) ?? [];
      setSelectedOrder(prev => prev ? { ...prev, order_items: items } : null);

      // SKU edit state'ini başlat
      const init: Record<string, { sku: string; title: string; saving: boolean; error: string }> = {};
      items.forEach((item: any) => {
        init[item.id] = {
          sku:   item.sku ?? "",
          title: item.products?.title ?? "",
          saving: false,
          error: "",
        };
      });
      setSkuEdits(init);
    } catch (e) {
      console.error(e);
    } finally {
      setItemsLoading(false);
    }
  }

  // SKU değişince ürün ara ve başlığı güncelle. STOK OTOMATİK DEĞİŞMEZ (değişimde stok elle
  // düzenlenir: eski ürün +1, yeni ürün −1); değişiklik sipariş geçmişine not düşer.
  async function handleSkuLookup(itemId: string, newSku: string) {
    const trimmed = newSku.trim();
    const prevItem: any = selectedOrder?.order_items?.find((i) => i.id === itemId);
    if (prevItem && String(prevItem.sku ?? "").trim() === trimmed) return;
    setSkuEdits(prev => ({ ...prev, [itemId]: { ...prev[itemId], sku: trimmed, error: "", saving: true } }));

    if (!trimmed) {
      setSkuEdits(prev => ({ ...prev, [itemId]: { ...prev[itemId], saving: false } }));
      return;
    }

    // SKU'ya göre varyasyonu, ürünü ve varyasyon seçeneklerini bul
    const { data: variant } = await (supabase
      .from("product_variants")
      .select("id, sku, product_id, products(title), variant_options(value, variant_groups(name))")
      .eq("sku", trimmed)
      .maybeSingle() as any) as { data: any };

    if (!variant) {
      setSkuEdits(prev => ({ ...prev, [itemId]: { ...prev[itemId], saving: false, error: `"${trimmed}" SKU bulunamadı` } }));
      return;
    }

    const newTitle = variant.products?.title ?? "";

    // Varyasyon adını oluştur (ör. "Beden: 36" veya "Renk: Kırmızı")
    const opt = variant.variant_options;
    const newVariantName: string = opt?.value && opt?.variant_groups?.name
      ? `${opt.variant_groups.name}: ${opt.value}`
      : (opt?.value ?? "");

    // order_items satırını güncelle (variant_name dahil)
    await (supabase
      .from("order_items")
      .update({ sku: trimmed, variant_id: variant.id, product_id: variant.product_id, variant_name: newVariantName } as any)
      .eq("id", itemId) as any);

    setSkuEdits(prev => ({ ...prev, [itemId]: { sku: trimmed, title: newTitle, saving: false, error: "" } }));

    // Sipariş geçmişine not + (stoğu düşülmüş siparişte) elle stok hatırlatması
    if (selectedOrder) {
      const oldLabel = `${prevItem?.sku || "—"}${prevItem?.variant_name ? ` (${prevItem.variant_name})` : ""}`;
      const newLabel = `${trimmed}${newVariantName ? ` (${newVariantName})` : ""}`;
      const stockTaken = !!selectedOrder.stock_reduced_at || !!prevItem?.stock_applied_at;
      const { data: { user } } = await supabase.auth.getUser();
      await (supabase as any).from("order_events").insert({
        order_id: selectedOrder.id,
        type: "corrected",
        note: `Satır değiştirildi: ${oldLabel} → ${newLabel}.${stockTaken ? " Stok otomatik değişmedi — elle düzenlenmeli." : ""}`,
        created_by: user?.id ?? null,
      });
      setTimelineTick((t) => t + 1);
      if (stockTaken) {
        const open = await siteConfirm({
          title: "Stok otomatik değişmedi",
          message: `Bu siparişin stoğu daha önce düşülmüştü. Stok Yönetimi'nde:\n• ${oldLabel} → +1\n• ${newLabel} → −1\n(Değişimde yeni ürünü gönderdiğinde düş, eski ürün geri geldiğinde ekle.)`,
          confirmText: "Stok Yönetimi'ni aç",
          cancelText: "Tamam",
        });
        if (open) window.open("/admin/stock", "_blank");
      }
    }

    // Lokal order_items state'ini de güncelle (variant_name dahil)
    setSelectedOrder(prev => {
      if (!prev) return null;
      return {
        ...prev,
        order_items: (prev.order_items ?? []).map(i =>
          i.id === itemId
            ? { ...i, sku: trimmed, product_id: variant.product_id, variant_id: variant.id, variant_name: newVariantName, products: { title: newTitle } }
            : i
        ),
      };
    });
  }

  // ─── Kargoya Ver ──────────────────────────────────────────────────────────

  async function handleShipOrder() {
    if (!shipDialogOrder) return;
    setShipping(true);
    setShipError(null);
    setShipResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/kargonomi/ship", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ order_id: shipDialogOrder.id, desi: Number(desi) }),
      });
      const json = await res.json();
      if (!res.ok) { setShipError(json.error ?? "Kargo oluşturulamadı."); return; }

      setShipResult({ tracking_code: json.tracking_code, label_url: json.label_url });
      setOrders(prev => prev.map(o =>
        o.id === shipDialogOrder.id
          ? { ...o, shipment_status: "shipped", kargonomi_tracking_code: json.tracking_code }
          : o
      ));
      if (selectedOrder?.id === shipDialogOrder.id) {
        setSelectedOrder(prev => prev
          ? { ...prev, shipment_status: "shipped", kargonomi_tracking_code: json.tracking_code }
          : null
        );
      }
    } catch {
      setShipError("Bağlantı hatası. Tekrar deneyin.");
    } finally {
      setShipping(false);
    }
  }

  // ── Durum seçenekleri ve kuralları: liste satırı ve sipariş detayı AYNI listeyi kullanır ──
  const PAYMENT_OPTIONS = [
    { value: "paid", label: "Ödendi" },
    { value: "pending", label: "Ödeme Bekleniyor" },
    { value: "failed", label: "Alınmadı" },
    { value: "partial_refund", label: "Kısmi iade…" },
    { value: "refunded", label: "İade edildi…" },
  ];
  const shipmentOptions = (o: Order) => [
    { value: "waiting", label: "Bekleniyor" },
    { value: "preparing", label: "Hazırlanıyor" },
    ...(o.kargonomi_tracking_code ? [] : [{ value: "ship_kargonomi", label: "Kargoya Ver (Kargonomi)" }]),
    { value: "shipped", label: o.kargonomi_tracking_code ? "Kargoya Verildi" : "Kargoya Verildi (elle)" },
    { value: "delivered", label: "Teslim Edildi" },
    { value: "returned", label: "İade geldi…" },
    { value: "cancelled", label: "İptal Edildi…" },
  ];
  const INVOICE_OPTIONS = [
    { value: "invoiced", label: "Faturalandı" },
    { value: "pending", label: "Bekleniyor" },
    { value: "return_invoiced", label: "İade faturası kesildi" },
    { value: "not_required", label: "Gerekmiyor" },
  ];

  // Satış sonrası (değişim / iade) yönetici işlemleri → /api/admin/orders/case
  async function caseOp(o: Order, payload: Record<string, unknown>, refresh = true): Promise<any> {
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch("/api/admin/orders/case", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify({ orderId: o.id, ...payload }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { siteAlert({ message: d.error || "İşlem yapılamadı", tone: "danger" }); return null; }
    if (refresh) await refreshOrder(o.id);
    return d;
  }

  // Tek siparişi (talepleriyle) yeniden oku → liste + detay güncellenir
  async function refreshOrder(id: string) {
    const { data } = await (supabase as any).from("orders")
      .select(`*, profiles(first_name, last_name, email, phone, email_verified), affiliate_profiles(code), order_cases(*)`)
      .eq("id", id).maybeSingle();
    if (!data) return;
    setOrders((prev) => prev.map((x) => (x.id === id ? { ...x, ...data } : x)));
    if (selectedOrder?.id === id) await handleViewDetails({ ...(selectedOrder as any), ...data });
    setTimelineTick((t) => t + 1);
  }

  // Sıradaki adım panelindeki düğmeler → mevcut işlemler (kurallar src/lib/order-next-step.ts)
  async function runNextAction(o: Order, key: NextActionKey) {
    switch (key) {
      case "mark_paid": return markPaymentPaid(o.id);
      case "cancel": return setActionMode("cancel");
      case "return": return setActionMode("return");
      case "refund": return setActionMode("refund");
      case "ship_kargonomi": setIsDetailsOpen(false); return openShipDialog(o);
      case "ship_manual":
        if (await siteConfirm({ title: "Kargoya verildi mi?", message: "Sipariş “Kargoda” olur ve müşteriye kargo e-postası gider.", confirmText: "Kargoya verildi" })) updateField(o.id, { shipment_status: "shipped" });
        return;
      case "mark_delivered": return updateField(o.id, { shipment_status: "delivered" });
      case "invoice":
        if (await siteConfirm({ title: "Fatura kesildi mi?", message: "Faturayı kestiysen işaretle.", confirmText: "Fatura kesildi" })) updateField(o.id, { invoice_status: "invoiced" });
        return;
      case "return_invoice": return updateField(o.id, { invoice_status: "return_invoiced" });
      case "fit_ok": await caseOp(o, { op: "fit_ok" }); return;
      case "case_link": {
        const d = await caseOp(o, { op: "link" }, false);
        if (d?.url) window.open(d.url, "_blank", "noopener");
        return;
      }
      case "alt_delivered":
        if (await siteConfirm({ title: "Alternatif teslim edildi mi?", message: "Müşteriye “hangisi oldu?” e-postası gider.", confirmText: "Teslim edildi" })) await caseOp(o, { op: "alt_delivered" });
        return;
      case "close_case":
        if (await siteConfirm({ title: "Talep kapatılsın mı?", message: "Müşteri vazgeçtiyse kapat; sipariş “müşteri deniyor” durumuna döner.", confirmText: "Kapat", tone: "danger" })) await caseOp(o, { op: "close" });
        return;
      case "mp_restock": {
        if (!(await siteConfirm({ title: "İade geldi mi?", message: "Ürünler depoya döndüyse ve satılabilir durumdaysa stoğa eklenir; yeni stok tüm pazaryerlerine gönderilir.", confirmText: "Stoğa ekle" }))) return;
        const { data: { session } } = await supabase.auth.getSession();
        const r = await fetch("/api/admin/orders/marketplace-restock", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
          body: JSON.stringify({ orderId: o.id }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { siteAlert({ message: d.error || "Stoğa eklenemedi", tone: "danger" }); return; }
        const patch = { mp_restocked_at: new Date().toISOString(), shipment_status: "returned" } as Partial<Order>;
        setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, ...patch } : x)));
        setSelectedOrder((prev) => (prev ? { ...prev, ...patch } : prev));
        siteAlert({ message: `${d.restored ?? 0} adet stoğa eklendi.`, tone: "success" });
        return;
      }
    }
  }

  // İptal / iade al / ücret iadesi penceresi detayın içinde açılır → listeden seçilince detayı açıp pencereyi göster
  async function openAction(o: Order, mode: "cancel" | "return" | "refund") {
    if (!isDetailsOpen || selectedOrder?.id !== o.id) await handleViewDetails(o);
    setActionMode(mode);
  }

  function selectPayment(o: Order, v: string) {
    const cur = o.payment_status || "pending";
    const paidNow = cur === "paid" || cur === "partial_refund";
    if (v === "partial_refund" || v === "refunded") {
      if (!paidNow) { siteAlert({ message: "Ödemesi alınmamış siparişe ücret iadesi girilemez.", tone: "danger" }); return; }
      // Para iadesi yalnız iptalle ya da ürün geri geldikten sonra (İade al) — sıradaki adım kuralı
      if (!nx(o).actions.some((a) => a.key === "refund")) {
        siteAlert({ title: "Önce iade", message: "Ücret iadesi, ürün geri gelince “İade al” penceresinde ya da kargodan önce “Siparişi iptal et” ile yapılır.", tone: "danger" });
        return;
      }
      openAction(o, "refund");
      return;
    }
    if (Number(o.refunded_amount || 0) > 0) {
      siteAlert({ title: "Değiştirilemez", message: "Bu siparişte ücret iadesi kaydı var; ödeme durumu iade kaydıyla belirlenir.", tone: "danger" });
      return;
    }
    if (v === "paid") markPaymentPaid(o.id);
    else if (v === "pending") updateField(o.id, { payment_status: "pending", status: "awaiting_payment" });
    else updateField(o.id, { payment_status: "failed" });
  }

  function selectShipment(o: Order, v: string) {
    const shippedNow = ["shipped", "delivered", "undelivered", "returned"].includes(o.shipment_status || "");
    if (v === "cancelled") {
      if (shippedNow) { siteAlert({ message: "Kargolanmış sipariş iptal edilemez — “İade al” kullan.", tone: "danger" }); return; }
      openAction(o, "cancel");
      return;
    }
    if (v === "returned") {
      if (!shippedNow) { siteAlert({ message: "Henüz kargolanmamış sipariş için “Siparişi iptal et” kullan.", tone: "danger" }); return; }
      openAction(o, "return");
      return;
    }
    if (v === "ship_kargonomi") {
      setIsDetailsOpen(false);
      openShipDialog(o);
      return;
    }
    updateField(o.id, { shipment_status: v });
  }

  function selectInvoice(o: Order, v: string) {
    const inv = o.invoice_status || "pending";
    if (v === "return_invoiced" && inv !== "invoiced") {
      siteAlert({ message: "İade faturası yalnız faturalanmış siparişte işaretlenebilir.", tone: "danger" }); return;
    }
    if (v === "not_required" && !(o.status === "cancelled" || o.payment_status === "failed")) {
      siteAlert({ message: "“Gerekmiyor” yalnız iptal edilmiş ya da ödemesi alınmamış siparişte seçilebilir.", tone: "danger" }); return;
    }
    updateField(o.id, { invoice_status: v });
  }

  // Liste satırındaki küçük durum menüsü (detaydaki StatusCombo ile aynı seçenekler)
  function StatusMenu({ label, color, options, current, onSelect }: {
    label: string; color: string; options: { value: string; label: string }[]; current: string; onSelect: (v: string) => void;
  }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={
          <button className="flex items-center gap-1 group/btn">
            <StatusBadge label={label} color={color} />
            <ChevronDown size={11} className="text-muted-foreground opacity-0 group-hover/btn:opacity-100 transition-opacity" />
          </button>
        } />
        <DropdownMenuContent align="start" className="min-w-[11rem]">
          {options.map((o) => {
            const isCur = o.value === current;
            return (
              <DropdownMenuItem key={o.value} disabled={isCur} onClick={() => { if (!isCur) onSelect(o.value); }}
                className={`gap-2 text-xs ${isCur ? "font-bold opacity-100" : ""}`}>
                <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${isCur ? "bg-blue-500" : "bg-slate-300"}`} />
                {o.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function openShipDialog(order: Order) {
    setShipDialogOrder(order);
    setDesi("2");
    setShipResult(null);
    setShipError(null);
  }

  // ─── Küçük badge bileşeni ─────────────────────────────────────────────────

  function StatusBadge({ label, color }: { label: string; color: string }) {
    return (
      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${color}`}>
        {label}
      </span>
    );
  }

  // Kompakt durum seçici: yalnızca güncel durumu gösterir, tıklanınca
  // alternatifleri açar (combobox). Seçim anında günceller.
  function StatusCombo({
    title, current, options, colors, fallback, onSelect,
  }: {
    title: string;
    current: string;
    options: { value: string; label: string }[];
    colors: Record<string, string>;
    fallback: string;
    onSelect: (value: string) => void;
  }) {
    const curLabel = options.find((o) => o.value === current)?.label ?? current;
    return (
      <div className="border rounded-xl p-2.5 space-y-1.5">
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{title}</p>
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <button className="group/sc w-full flex items-center justify-between gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold ring-1 ring-inset hover:brightness-95 transition">
              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${colors[current] ?? colors[fallback]}`}>
                {curLabel}
              </span>
              <ChevronDown size={13} className="text-muted-foreground shrink-0" />
            </button>
          } />
          <DropdownMenuContent align="start" className="min-w-[10rem]">
            {options.map((o) => {
              const isCur = o.value === current;
              return (
                <DropdownMenuItem
                  key={o.value}
                  disabled={isCur}
                  onClick={() => { if (!isCur) onSelect(o.value); }}
                  className={`gap-2 text-xs ${isCur ? "font-bold opacity-100" : ""}`}
                >
                  <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${isCur ? "bg-blue-500" : "bg-slate-300"}`} />
                  {o.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  // ─── Liste hesaplama ──────────────────────────────────────────────────────
  const LIST_PAGE = 50;
  const trNorm = (v: unknown) => String(v ?? "").toLocaleLowerCase("tr-TR");
  const customerName = (o: Order) => {
    if ((isMarketplace(o) || !o.profiles) && o.customer_name) return o.customer_name;
    const n = `${o.profiles?.first_name ?? ""} ${o.profiles?.last_name ?? ""}`.trim();
    if (n) return n;
    try { const a = typeof o.shipping_address === "string" ? JSON.parse(o.shipping_address as any) : (o.shipping_address as any); return a?.name || ""; } catch { return ""; }
  };
  const PAY_ORDER: Record<string, number> = { pending: 0, failed: 1, paid: 2 };
  const SHIP_ORDER: Record<string, number> = { waiting: 0, preparing: 1, shipped: 2, delivered: 3, cancelled: 4 };
  const INV_ORDER: Record<string, number> = { pending: 0, invoiced: 1 };
  const visibleOrders = (() => {
    const needle = trNorm(q.trim()).replace(/^#/, "");
    const list = orders.filter((o) => {
      if (fPay !== "all" && (o.payment_status || "pending") !== fPay) return false;
      if (fShip !== "all" && (o.shipment_status || "waiting") !== fShip) return false;
      if (fInv !== "all" && (o.invoice_status || "pending") !== fInv) return false;
      if (fRet !== "all") {
        const pay = o.payment_status || "pending";
        const refundedPay = pay === "refunded" || pay === "partial_refund";
        if (fRet === "returned_unrefunded" && !(o.shipment_status === "returned" && pay === "paid")) return false;
        if (fRet === "refunded_no_return_invoice" && !(refundedPay && (o.invoice_status || "pending") === "invoiced")) return false;
        if (fRet === "cancelled_unrefunded" && !(o.status === "cancelled" && (pay === "paid" || pay === "partial_refund"))) return false;
        if (fRet === "any_refund" && !refundedPay) return false;
      }
      if (fMethod !== "all" && (o.payment_method || "credit_card") !== fMethod) return false;
      if (fTodo && !nx(o).needsAction) return false;
      if (fChannel !== "all" && (o.channel || "site") !== fChannel) return false;
      if (!needle) return true;
      const hay = trNorm([
        o.order_number ? `yh${o.order_number}` : "", o.order_number, o.id,
        customerName(o), o.profiles?.email, o.profiles?.phone,
        o.external_order_number, o.customer_email, o.customer_phone, o.cargo_tracking_number,
      ].filter(Boolean).join(" "));
      return needle.split(/\s+/).every((t) => hay.includes(t));
    });
    const val = (o: Order): number | string => {
      switch (sortKey) {
        case "no": return Number(o.order_number ?? 0);
        case "customer": return trNorm(customerName(o));
        case "amount": return Number(o.total_amount ?? 0);
        case "pay": return PAY_ORDER[o.payment_status || "pending"] ?? 0;
        case "ship": return SHIP_ORDER[o.shipment_status || "waiting"] ?? 0;
        case "inv": return INV_ORDER[o.invoice_status || "pending"] ?? 0;
        default: return new Date(o.created_at).getTime();
      }
    };
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === "string" || typeof vb === "string") return String(va).localeCompare(String(vb), "tr") * dir;
      return (va - vb) * dir;
    });
  })();
  const listPageCount = Math.max(1, Math.ceil(visibleOrders.length / LIST_PAGE));
  const safeListPage = Math.min(listPage, listPageCount - 1);
  const pagedOrders = visibleOrders.slice(safeListPage * LIST_PAGE, safeListPage * LIST_PAGE + LIST_PAGE);
  const filtersActive = fTodo || !!q.trim() || fPay !== "all" || fShip !== "all" || fInv !== "all" || fMethod !== "all" || fChannel !== "all" || fRet !== "all";

  function toggleSort(k: typeof sortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "customer" ? "asc" : "desc"); }
    setListPage(0);
  }
  function SortHead({ k, children, className }: { k: typeof sortKey; children: React.ReactNode; className?: string }) {
    const active = sortKey === k;
    return (
      <TableHead className={className}>
        <button onClick={() => toggleSort(k)} className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground font-bold" : ""}`}>
          {children}
          <span className="text-[10px]">{active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>
        </button>
      </TableHead>
    );
  }
  const selCls = "h-9 rounded-lg border border-input bg-background px-2 text-xs font-medium";

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <AdminOpsTabs active="orders" />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Siparişler</h2>
          <p className="text-muted-foreground">Müşterilerinizin verdiği siparişleri yönetin.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          + Yeni Sipariş
        </Button>
      </div>

      <Card className="shadow-sm border-muted">
        <CardHeader>
          <CardTitle>Sipariş Listesi</CardTitle>
          <CardDescription>Tüm siparişlerin güncel durumları ve detayları.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground animate-pulse">
              <Loader2 className="mx-auto h-8 w-8 animate-spin mb-2" /> Yükleniyor...
            </div>
          ) : orders.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground border border-dashed rounded-lg">
              Sistemde henüz sipariş bulunmuyor.
            </div>
          ) : (
            <>
            {/* Arama + süzgeçler */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <button
                onClick={() => { setFTodo((v) => !v); setListPage(0); }}
                className={`h-9 px-3 rounded-lg border text-sm font-bold transition ${fTodo ? "bg-olive-600 text-white border-olive-600" : "bg-background text-slate-700 hover:bg-slate-50"}`}
                title="Sıradaki adımı sende olan siparişler (ödeme onayı, kargoya verme, iade, fatura…)"
              >
                Bekleyen işlerim ({orders.filter((o) => nx(o).needsAction).length})
              </button>
              <div className="relative flex-1 min-w-[220px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setListPage(0); }}
                  placeholder="Ara: sipariş no (YH25018 / pazaryeri no), ad soyad, e-posta, telefon…"
                  className="w-full h-9 pl-8 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>
              <select value={fChannel} onChange={(e) => { setFChannel(e.target.value); setListPage(0); }} className={selCls}>
                <option value="all">Kanal: tümü</option>
                {channels.filter((c) => c.is_active || orders.some((o) => (o.channel || "site") === c.code)).map((c) => (
                  <option key={c.code} value={c.code}>Kanal: {c.label}</option>
                ))}
              </select>
              <select value={fPay} onChange={(e) => { setFPay(e.target.value); setListPage(0); }} className={selCls}>
                <option value="all">Ödeme: tümü</option>
                {Object.entries(paymentLabels).map(([k, l]) => <option key={k} value={k}>Ödeme: {l}</option>)}
              </select>
              <select value={fShip} onChange={(e) => { setFShip(e.target.value); setListPage(0); }} className={selCls}>
                <option value="all">Sevkiyat: tümü</option>
                {Object.entries(shipmentLabels).map(([k, l]) => <option key={k} value={k}>Sevkiyat: {l}</option>)}
              </select>
              <select value={fRet} onChange={(e) => { setFRet(e.target.value); setListPage(0); }} className={selCls}>
                <option value="all">İade / iptal: tümü</option>
                <option value="returned_unrefunded">İade geldi, ücret iade edilmedi</option>
                <option value="refunded_no_return_invoice">Ücret iade edildi, iade faturası eksik</option>
                <option value="cancelled_unrefunded">İptal, ücret iade edilmedi</option>
                <option value="any_refund">Ücret iadesi olanlar</option>
              </select>
              <select value={fInv} onChange={(e) => { setFInv(e.target.value); setListPage(0); }} className={selCls}>
                <option value="all">Fatura: tümü</option>
                {Object.entries(invoiceLabels).map(([k, l]) => <option key={k} value={k}>Fatura: {l}</option>)}
              </select>
              <select value={fMethod} onChange={(e) => { setFMethod(e.target.value); setListPage(0); }} className={selCls}>
                <option value="all">Yöntem: tümü</option>
                <option value="credit_card">Yöntem: Kart</option>
                <option value="bank_transfer">Yöntem: Havale/EFT</option>
                <option value="store_credit">Yöntem: YH Kredisi</option>
              </select>
              {filtersActive && (
                <button
                  onClick={() => { setQ(""); setFPay("all"); setFShip("all"); setFInv("all"); setFMethod("all"); setFChannel("all"); setFRet("all"); setListPage(0); }}
                  className="h-9 px-3 rounded-lg text-xs font-bold text-muted-foreground hover:text-foreground"
                >
                  Temizle
                </button>
              )}
              <span className="text-xs text-muted-foreground ml-auto">{visibleOrders.length} / {orders.length} sipariş</span>
            </div>
            {visibleOrders.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground border border-dashed rounded-lg">
                Aramaya / süzgeçlere uyan sipariş yok.
              </div>
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <span className="inline-flex items-center gap-2">
                      <button onClick={() => toggleSort("no")} className={`inline-flex items-center gap-1 hover:text-foreground ${sortKey === "no" ? "text-foreground font-bold" : ""}`}>
                        Sipariş <span className="text-[10px]">{sortKey === "no" ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>
                      </button>
                      /
                      <button onClick={() => toggleSort("customer")} className={`inline-flex items-center gap-1 hover:text-foreground ${sortKey === "customer" ? "text-foreground font-bold" : ""}`}>
                        Müşteri <span className="text-[10px]">{sortKey === "customer" ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>
                      </button>
                    </span>
                  </TableHead>
                  <SortHead k="date">Tarih</SortHead>
                  <SortHead k="amount">Tutar</SortHead>
                  <SortHead k="pay">Ödeme</SortHead>
                  <SortHead k="ship">Sevkiyat</SortHead>
                  <SortHead k="inv">Fatura</SortHead>
                  <TableHead className="text-right">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedOrders.map((order) => {
                  const pStatus = order.payment_status  || "pending";
                  const sStatus = order.shipment_status || "waiting";
                  const iStatus = order.invoice_status  || "pending";
                  const isUpdating = updatingId === order.id;

                  return (
                    <TableRow key={order.id} className="group hover:bg-muted/50 transition-colors">
                      {/* Sipariş / Müşteri */}
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-mono text-[11px] font-bold text-blue-600 flex items-center gap-1.5">
                            {orderLabel(order)}
                            <ChannelBadge code={order.channel} channels={channels} />
                            {isMarketplace(order) && order.mp_warning && !order.mp_warning_ack && (
                              <span title={order.mp_warning} className="text-red-600"><AlertCircle size={12} /></span>
                            )}
                          </span>
                          {/* Eski YeriHisset siparişi numarası doluyken yeni YH numarası aldıysa: eski no */}
                          {isImported(order) && (order.channel || "site") === "site" && order.external_order_number && String(order.external_order_number) !== String(order.order_number) && (
                            <span className="font-mono text-[10px] text-slate-500">Eski no #{order.external_order_number}</span>
                          )}
                          <span className="font-medium text-sm">
                            {customerName(order)}
                          </span>
                          {order.payment_method === "bank_transfer" && (
                            <span className="text-[10px] text-amber-600 flex items-center gap-0.5 mt-0.5">
                              <Landmark size={9} /> Havale/EFT
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Tarih + Saat */}
                      <TableCell className="text-xs text-muted-foreground">
                        <div>{new Date(order.created_at).toLocaleDateString("tr-TR")}</div>
                        <div className="text-[11px] text-slate-400">
                          {new Date(order.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </TableCell>

                      {/* Tutar */}
                      <TableCell className="font-semibold text-sm">
                        ₺{order.total_amount.toFixed(2)}
                        {Number(order.refunded_amount || 0) > 0 && (
                          <div className="text-[10px] font-semibold text-orange-700">−₺{Number(order.refunded_amount).toFixed(2)} iade</div>
                        )}
                      </TableCell>

                      {/* Ödeme durumu + aksiyon (pazaryerinde salt okunur — pazaryeri tahsil eder) */}
                      <TableCell>
                        {isMarketplace(order) ? (
                          <StatusBadge label={paymentLabels[pStatus] ?? pStatus} color={paymentColors[pStatus] ?? paymentColors.pending} />
                        ) : isUpdating ? (
                          <Loader2 size={14} className="animate-spin text-muted-foreground" />
                        ) : (
                          <StatusMenu label={paymentLabels[pStatus] ?? pStatus} color={paymentColors[pStatus] ?? paymentColors.pending}
                            options={PAYMENT_OPTIONS} current={pStatus} onSelect={(v) => selectPayment(order, v)} />
                        )}
                      </TableCell>

                      {/* Sevkiyat durumu + aksiyon (pazaryerinde durum pazaryerinden gelir) */}
                      <TableCell>
                        {isMarketplace(order) ? (
                          <div className="flex flex-col gap-1">
                            <StatusBadge label={shipmentLabels[sStatus] ?? sStatus} color={shipmentColors[sStatus] ?? shipmentColors.waiting} />
                            {order.cargo_tracking_number && (
                              <span className="text-[10px] font-mono text-purple-600 flex items-center gap-1">
                                <Truck size={9} /> {order.cargo_tracking_number}
                              </span>
                            )}
                          </div>
                        ) : isUpdating ? (
                          <Loader2 size={14} className="animate-spin text-muted-foreground" />
                        ) : (
                          <div className="flex flex-col gap-1">
                            <StatusMenu label={shipmentLabels[sStatus] ?? sStatus} color={shipmentColors[sStatus] ?? shipmentColors.waiting}
                              options={shipmentOptions(order)} current={sStatus} onSelect={(v) => selectShipment(order, v)} />
                            {order.kargonomi_tracking_code && (
                              <span className="text-[10px] font-mono text-purple-600 flex items-center gap-1">
                                <Truck size={9} /> {order.kargonomi_tracking_code}
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>

                      {/* Fatura durumu + aksiyon */}
                      <TableCell>
                        {isUpdating ? (
                          <Loader2 size={14} className="animate-spin text-muted-foreground" />
                        ) : (
                          <StatusMenu label={invoiceLabels[iStatus] ?? iStatus} color={invoiceColors[iStatus] ?? invoiceColors.pending}
                            options={INVOICE_OPTIONS} current={iStatus} onSelect={(v) => selectInvoice(order, v)} />
                        )}
                      </TableCell>

                      {/* İşlemler */}
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 text-xs gap-1"
                          onClick={() => handleViewDetails(order)}
                        >
                          <Eye size={12} /> Detay
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            )}
            {visibleOrders.length > LIST_PAGE && (
              <div className="flex items-center justify-between pt-4 text-xs text-muted-foreground">
                <span>{safeListPage * LIST_PAGE + 1}–{Math.min((safeListPage + 1) * LIST_PAGE, visibleOrders.length)} / {visibleOrders.length}</span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={safeListPage === 0} onClick={() => setListPage(safeListPage - 1)}>Önceki</Button>
                  <span className="font-bold">{safeListPage + 1} / {listPageCount}</span>
                  <Button size="sm" variant="outline" disabled={safeListPage >= listPageCount - 1} onClick={() => setListPage(safeListPage + 1)}>Sonraki</Button>
                </div>
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Kargoya Ver Dialog ───────────────────────────────────────────── */}
      <Dialog
        open={!!shipDialogOrder}
        onOpenChange={(open) => { if (!open) { setShipDialogOrder(null); setShipResult(null); setShipError(null); } }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck size={18} className="text-purple-600" /> Kargoya Ver
            </DialogTitle>
            <DialogDescription>
              Sipariş {orderLabel(shipDialogOrder)} — Kargonomi üzerinden gönderi oluşturulacak.
            </DialogDescription>
          </DialogHeader>

          {shipResult ? (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
                <CheckCircle size={22} className="text-green-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-800">Kargo başarıyla oluşturuldu!</p>
                  <p className="text-xs text-green-600 mt-0.5">Sevkiyat durumu "Kargoya Verildi" olarak güncellendi.</p>
                </div>
              </div>
              <div className="bg-slate-50 border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-medium">Takip Kodu</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(shipResult.tracking_code)}
                    className="text-blue-500 hover:text-blue-700 text-xs flex items-center gap-1"
                  >
                    <Copy size={12} /> Kopyala
                  </button>
                </div>
                <code className="text-sm font-mono font-bold block">{shipResult.tracking_code}</code>
              </div>
              {shipResult.label_url && (
                <a
                  href={shipResult.label_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2 px-4 border border-purple-300 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-50 transition-colors"
                >
                  <ExternalLink size={14} /> Kargo Etiketini Aç
                </a>
              )}
              <Button className="w-full" variant="outline" onClick={() => { setShipDialogOrder(null); setShipResult(null); }}>
                Kapat
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {shipDialogOrder && (() => {
                let addr: Record<string, string> = {};
                try { addr = typeof shipDialogOrder.shipping_address === "string" ? JSON.parse(shipDialogOrder.shipping_address) : shipDialogOrder.shipping_address ?? {}; } catch {}
                return (
                  <div className="bg-slate-50 border rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                    <p className="font-semibold text-slate-700">{addr.name ?? `${shipDialogOrder.profiles?.first_name} ${shipDialogOrder.profiles?.last_name}`}</p>
                    <p>{addr.address}</p>
                    <p>{addr.district && `${addr.district}, `}{addr.city}</p>
                    <p>{addr.phone ?? shipDialogOrder.profiles?.phone}</p>
                  </div>
                );
              })()}

              <div className="space-y-2">
                <label htmlFor="desi" className="text-sm font-medium">
                  Desi <span className="text-muted-foreground font-normal">(tahmini kargo ağırlık birimi)</span>
                </label>
                <Input
                  id="desi"
                  type="number"
                  min="1"
                  max="300"
                  step="0.5"
                  value={desi}
                  onChange={(e) => setDesi(e.target.value)}
                  placeholder="2"
                />
              </div>

              {shipError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  {shipError}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setShipDialogOrder(null)} disabled={shipping}>
                  İptal
                </Button>
                <Button
                  className="flex-1 gap-2 bg-purple-600 hover:bg-purple-700"
                  onClick={handleShipOrder}
                  disabled={shipping || !desi}
                >
                  {shipping ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  {shipping ? "Gönderiliyor..." : "Kargoya Ver"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Detay Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[860px] max-h-[90vh] overflow-y-auto top-[5vh] translate-y-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Sipariş Detayı
              <span className="text-sm font-mono font-bold text-blue-600">
                {orderLabel(selectedOrder)}
              </span>
              <ChannelBadge code={selectedOrder?.channel} channels={channels} size="md" />
            </DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6 py-2">

              {/* Pazaryeri siparişi: numara, durum, kargo, uyarı, iade → stok */}
              {isMarketplace(selectedOrder) && (
                <MarketplaceOrderPanel
                  order={selectedOrder}
                  onChange={(fields) => {
                    setSelectedOrder((prev) => (prev ? { ...prev, ...fields } : prev));
                    setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? { ...o, ...fields } : o)));
                  }}
                  onRestocked={() => handleViewDetails(selectedOrder)}
                />
              )}

              {/* Eski siteden aktarılan sipariş: kaynak, eski no, ödeme yöntemi, kupon, ek ücret, not */}
              {isImported(selectedOrder) && <ImportedOrderPanel order={selectedOrder} channels={channels} />}

              {/* Fatura Bilgileri + Teslimat Adresi */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <FileText size={13} /> Fatura Bilgileri
                  </h4>
                  <div className="text-sm space-y-1 bg-muted/30 p-3 rounded-lg border">
                    {(() => {
                      const parse = (v: unknown) => { try { return typeof v === "string" ? JSON.parse(v) : v; } catch { return null; } };
                      const bill: any = parse(selectedOrder.billing_address);
                      const ship: any = parse(selectedOrder.shipping_address);
                      // Fatura snapshot'ı yoksa (eski siparişler) teslimatı baz al.
                      const b: any = bill || (ship ? { ...ship, same_as_shipping: true } : null);
                      const sameAsShip = !bill || bill.same_as_shipping;
                      const billAddrText = b
                        ? [b.address, [b.district, b.city].filter(Boolean).join(", ")].filter(Boolean).join("\n")
                        : "";
                      return (
                        <>
                          <p className="font-semibold flex items-center gap-1.5">
                            {b?.name || `${selectedOrder.profiles?.first_name ?? ""} ${selectedOrder.profiles?.last_name ?? ""}`}
                            {b?.is_corporate && (
                              <span className="text-[9px] font-bold bg-blue-100 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 uppercase tracking-wide">Kurumsal</span>
                            )}
                          </p>
                          {b?.is_corporate && (
                            <div className="text-xs bg-blue-50/60 border border-blue-100 rounded-lg px-2.5 py-1.5 space-y-0.5 my-1">
                              <p className="font-bold text-slate-800 flex items-center gap-1.5"><Building2 size={11} /> {b.company_name || "—"}</p>
                              <p className="text-muted-foreground">V.D.: {b.tax_office || "—"} · VKN: <span className="font-mono">{b.tax_number || "—"}</span></p>
                            </div>
                          )}
                          {b?.identity_number && !b?.is_corporate && (
                            <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-mono"><Fingerprint size={11} /> TCKN: {b.identity_number}</p>
                          )}
                          <p className="text-muted-foreground flex items-center gap-1.5 flex-wrap">
                            <Mail size={11} /> {selectedOrder.profiles?.email}
                            {selectedOrder.profiles?.email_verified === false ? (
                              <span className="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5" title="Müşteri e-postasını doğrulamadı — adres yanlış olabilir">E-posta doğrulanmadı ⚠</span>
                            ) : selectedOrder.profiles?.email_verified === true ? (
                              <span className="text-[10px] font-bold bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5">Doğrulandı ✓</span>
                            ) : null}
                          </p>
                          <p className="text-muted-foreground flex items-center gap-1.5"><Phone size={11} /> {b?.phone || selectedOrder.profiles?.phone || "—"}</p>
                          {selectedOrder.payment_method === "bank_transfer" && (
                            <p className="text-amber-600 flex items-center gap-1.5 font-medium"><Landmark size={11} /> Havale / EFT</p>
                          )}
                          <div className="pt-1.5 mt-1.5 border-t border-dashed border-slate-200">
                            {sameAsShip ? (
                              <p className="text-[11px] text-green-700 font-medium flex items-center gap-1"><CheckCircle size={11} /> Fatura adresi teslimatla aynı</p>
                            ) : (
                              <>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Fatura Adresi (teslimattan farklı)</p>
                                <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap text-xs">{billAddrText || "—"}</p>
                              </>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <MapPin size={13} /> Teslimat Adresi
                  </h4>
                  <div className="text-sm bg-muted/30 p-3 rounded-lg border h-full">
                    <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap text-xs">
                      {(() => {
                        try {
                          const a = typeof selectedOrder.shipping_address === "string"
                            ? JSON.parse(selectedOrder.shipping_address)
                            : selectedOrder.shipping_address;
                          return `${a.name}\n${a.address}\n${a.district ? a.district + ", " : ""}${a.city}\n${a.phone || ""}`;
                        } catch {
                          return selectedOrder.shipping_address || "—";
                        }
                      })()}
                    </p>
                  </div>
                </div>
              </div>

              {/* 3 Boyutlu Durum — kompakt: güncel durum + tıklayınca combobox */}
              <div className="grid grid-cols-3 gap-3">
{isMarketplace(selectedOrder) ? (
              <>
                {/* Pazaryeri: ödeme + sevkiyat pazaryerinden gelir (salt okunur) */}
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Ödeme</p>
                  <StatusBadge label={paymentLabels[selectedOrder.payment_status || "paid"] ?? "Ödendi"} color={paymentColors[selectedOrder.payment_status || "paid"] ?? paymentColors.paid} />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sevkiyat</p>
                  <StatusBadge label={shipmentLabels[selectedOrder.shipment_status || "preparing"] ?? (selectedOrder.shipment_status || "")} color={shipmentColors[selectedOrder.shipment_status || "preparing"] ?? shipmentColors.waiting} />
                </div>
              </>
              ) : (
              <>
                {/* Ödeme */}
                <StatusCombo
                  title="Ödeme"
                  current={selectedOrder.payment_status || "pending"}
                  colors={paymentColors}
                  fallback="pending"
                  options={PAYMENT_OPTIONS}
                  onSelect={(v) => selectPayment(selectedOrder, v)}
                />

                {/* Sevkiyat */}
                <div className="space-y-1.5">
                  <StatusCombo
                    title="Sevkiyat"
                    current={selectedOrder.shipment_status || "waiting"}
                    colors={shipmentColors}
                    fallback="waiting"
                    options={shipmentOptions(selectedOrder)}
                    onSelect={(v) => selectShipment(selectedOrder, v)}
                  />
                  {selectedOrder.kargonomi_tracking_code && (
                    <div className="flex items-center gap-1 px-1">
                      <code className="text-[10px] font-mono text-purple-700">{selectedOrder.kargonomi_tracking_code}</code>
                      <button onClick={() => navigator.clipboard.writeText(selectedOrder.kargonomi_tracking_code!)} className="text-purple-400 hover:text-purple-700">
                        <Copy size={10} />
                      </button>
                    </div>
                  )}
                </div>

              </>
              )}

                {/* Fatura */}
                <StatusCombo
                  title="Fatura"
                  current={selectedOrder.invoice_status || "pending"}
                  colors={invoiceColors}
                  fallback="pending"
                  options={INVOICE_OPTIONS}
                  onSelect={(v) => selectInvoice(selectedOrder, v)}
                />
              </div>

              {/* SIRADAKİ ADIM — yalnız bu durumda yapılabilecek işlemler (src/lib/order-next-step.ts) */}
              {(() => {
                const o = selectedOrder;
                const step = nx(o);
                const refunded = Number(o.refunded_amount || 0);
                return (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sıradaki adım</span>
                      <span className="text-xs font-bold text-slate-800 bg-white border rounded-full px-2.5 py-0.5">{step.stage}</span>
                      {refunded > 0 && (
                        <span className="text-xs text-slate-600 ml-auto">
                          İade edilen: <b>₺{refunded.toFixed(2)}</b>{o.refund_method ? ` (${REFUND_METHOD_LABEL[o.refund_method] ?? o.refund_method})` : ""}
                        </span>
                      )}
                    </div>
                    {step.hint && <p className="text-xs text-slate-600">{step.hint}</p>}
                    {openCaseOf(o) && (
                      <CaseBox
                        order={o}
                        kase={openCaseOf(o)}
                        canSendLabel={step.actions.some((a) => a.key === "send_label")}
                        canShipAlt={step.actions.some((a) => a.key === "ship_alt")}
                        onDone={() => refreshOrder(o.id)}
                      />
                    )}
                    {step.actions.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        {step.actions.filter((a) => a.key !== "send_label" && a.key !== "ship_alt").map((a) => (
                          <Button
                            key={a.key}
                            size="sm"
                            variant={a.kind === "primary" ? "default" : "outline"}
                            disabled={updatingId === o.id}
                            className={a.kind === "danger" ? "gap-1.5 text-red-700 border-red-200 hover:bg-red-50" : "gap-1.5"}
                            onClick={() => runNextAction(o, a.key)}
                          >
                            {a.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Ürünler */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <ShoppingBag size={13} /> Sipariş İçeriği
                </h4>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="h-8 text-xs w-28">Ürün Kodu</TableHead>
                        <TableHead className="h-8 text-xs">Ürün Adı</TableHead>
                        <TableHead className="h-8 text-xs text-center w-12">Adet</TableHead>
                        <TableHead className="h-8 text-xs text-right w-20">Birim</TableHead>
                        <TableHead className="h-8 text-xs text-right w-20">Toplam</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itemsLoading ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-6">
                            <Loader2 size={16} className="animate-spin mx-auto text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      ) : selectedOrder.order_items?.map((item) => {
                        const edit = skuEdits[item.id];
                        const invoiced = selectedOrder.invoice_status === "invoiced";
                        return (
                          <TableRow key={item.id}>
                            {/* Ürün Kodu (SKU) — inline edit (fatura kesildiyse kilitli) */}
                            <TableCell className="py-2">
                              <div className="space-y-0.5">
                                <div className="relative">
                                  <input
                                    readOnly={invoiced}
                                    title={invoiced ? "Fatura kesildiği için ürün kodu değiştirilemez" : undefined}
                                    className={`w-full text-xs font-mono px-2 py-1 rounded border focus:outline-none focus:ring-1 focus:ring-blue-500 transition ${edit?.error ? "border-red-400" : "border-slate-200"} ${invoiced ? "bg-slate-100 text-slate-500 cursor-not-allowed" : "bg-white"}`}
                                    value={edit?.sku ?? item.sku ?? ""}
                                    placeholder="SKU girin…"
                                    onChange={(e) => {
                                      if (invoiced) return;
                                      setSkuEdits(prev => ({
                                        ...prev,
                                        [item.id]: { ...prev[item.id], sku: e.target.value, error: "" },
                                      }));
                                    }}
                                    onBlur={(e) => {
                                      if (invoiced) return;
                                      const val = e.target.value.trim();
                                      const orig = item.sku ?? "";
                                      if (val !== orig) handleSkuLookup(item.id, val);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.currentTarget.blur();
                                      }
                                    }}
                                  />
                                  {edit?.saving && (
                                    <Loader2 size={11} className="animate-spin absolute right-1.5 top-1/2 -translate-y-1/2 text-blue-500" />
                                  )}
                                </div>
                                {edit?.error && (
                                  <p className="text-[10px] text-red-500 leading-none">{edit.error}</p>
                                )}
                              </div>
                            </TableCell>
                            {/* Ürün Adı + Varyasyon */}
                            <TableCell className="text-xs font-medium py-2">
                              <div className="flex flex-col gap-0.5">
                                <span>{edit?.title || item.products?.title || item.title || <span className="text-muted-foreground italic">—</span>}</span>
                                {isMarketplace(selectedOrder) && !item.product_id && (
                                  <span className="text-[10px] text-red-600 font-semibold">Sitede eşleşmedi — stok düşülmedi (barkod {item.barcode || "—"})</span>
                                )}
                                {isImported(selectedOrder) && !item.product_id && (
                                  <a href="/admin/products/unmatched" className="text-[10px] text-amber-700 font-semibold hover:underline">
                                    Eski ürün — sitede eşleşmedi (SKU {item.sku || "—"}) · eşleştir →
                                  </a>
                                )}
                                {isMarketplace(selectedOrder) && item.stock_restored_at && (
                                  <span className="text-[10px] text-amber-700">Stok geri eklendi</span>
                                )}
                                {item.variant_name && (
                                  <span className="text-[10px] text-muted-foreground font-normal bg-slate-100 rounded px-1.5 py-0.5 w-fit">
                                    {item.variant_name}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-center py-2">{item.quantity}</TableCell>
                            <TableCell className="text-xs text-right text-muted-foreground py-2">₺{item.unit_price.toFixed(2)}</TableCell>
                            <TableCell className="text-xs text-right font-semibold py-2">₺{(item.unit_price * item.quantity).toFixed(2)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {/* Tutar dökümü: ürünler + kargo − kupon − kredi = genel toplam */}
                  {(() => {
                    const o = selectedOrder;
                    const itemsTotal = (o.order_items || []).reduce((s, i) => s + Number(i.unit_price) * Number(i.quantity), 0);
                    const ship = Number(o.shipping_cost || 0);
                    const coupon = Number(o.coupon_discount || 0);
                    const credit = Number(o.credit_used || 0);
                    const refunded = Number(o.refunded_amount || 0);
                    const fmt = (n: number) => `₺${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    return (
                      <div className="border-t text-sm">
                        <div className="px-3 pt-3 space-y-1.5 text-slate-600">
                          <div className="flex justify-between"><span>Ürün toplamı</span><span>{fmt(itemsTotal)}</span></div>
                          <div className="flex justify-between">
                            <span>Kargo{o.shipping_method ? <span className="text-muted-foreground"> · {o.shipping_method}</span> : null}</span>
                            <span className={ship === 0 ? "text-green-600 font-semibold" : ""}>{ship === 0 ? "Ücretsiz" : fmt(ship)}</span>
                          </div>
                          {coupon > 0 && <div className="flex justify-between"><span>Kupon indirimi</span><span className="text-red-600">−{fmt(coupon)}</span></div>}
                          {credit > 0 && <div className="flex justify-between"><span>YeriHisset Kredisi</span><span className="text-red-600">−{fmt(credit)}</span></div>}
                          {o.affiliate_profiles?.code && (
                            <div className="flex justify-between text-xs pt-1"><span>Satış ortağı (komisyon)</span><span className="font-mono font-semibold text-olive-700">{o.affiliate_profiles.code}</span></div>
                          )}
                          {adSourceLabel(o) && (
                            <div className="flex justify-between gap-3 text-xs pt-1"><span>Kaynak</span><span className="font-semibold text-indigo-700 text-right">{adSourceLabel(o)}</span></div>
                          )}
                          {o.attribution?.capi?.status && (
                            <div className="flex justify-between gap-3 text-xs"><span>Meta (sunucu bildirimi)</span><span className={o.attribution.capi.status === "failed" ? "text-red-600 text-right" : "text-muted-foreground text-right"}>{o.attribution.capi.status === "sent" ? (o.attribution.capi.test ? "gönderildi (test)" : "gönderildi") : o.attribution.capi.status === "failed" ? `hata: ${o.attribution.capi.error || "?"}` : `gönderilmedi (${o.attribution.capi.reason || "—"})`}</span></div>
                          )}
                        </div>
                        <div className="bg-muted/50 mt-3 p-3 flex justify-between items-center border-t">
                          <span className="text-sm font-bold">Genel Toplam</span>
                          <span className="text-lg font-black text-blue-600">{fmt(Number(o.total_amount))}</span>
                        </div>
                        {refunded > 0 && (
                          <div className="px-3 py-2 flex justify-between text-xs text-orange-700 bg-orange-50 border-t">
                            <span>İade edilen</span><span>−{fmt(refunded)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {selectedOrder.invoice_status === "invoiced"
                    ? "🔒 Fatura kesildiği için ürün kodları kilitlidir, değiştirilemez."
                    : "Ürün kodunu düzenleyip Enter'a basın veya alandan çıkın — kod değiştiğinde ürün adı otomatik güncellenir."}
                </p>
              </div>

              {/* Admin Notu */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FileText size={13} /> Admin Notu
                </h4>
                <div className="relative">
                  <textarea
                    className="w-full text-sm border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 bg-amber-50/50 border-amber-200 placeholder:text-slate-400"
                    rows={3}
                    placeholder="Sadece adminler görebilir…"
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    onBlur={() => selectedOrder && saveAdminNote(selectedOrder.id, adminNote)}
                  />
                  {adminNoteSaving && (
                    <Loader2 size={12} className="animate-spin absolute right-2 top-2 text-blue-400" />
                  )}
                </div>
              </div>

              {/* İptal / iade al / ücret iadesi penceresi */}
              {actionMode && (
                <OrderActionDialog
                  mode={actionMode}
                  order={selectedOrder}
                  onClose={() => setActionMode(null)}
                  onDone={(fresh) => {
                    setActionMode(null);
                    setOrders((prev) => prev.map((o) => (o.id === fresh.id ? { ...o, ...fresh } : o)));
                    handleViewDetails({ ...selectedOrder, ...fresh });
                    setTimelineTick((t) => t + 1);
                  }}
                />
              )}

              {/* Süreç Takibi (yaşam döngüsü) */}
              <div className="pt-2 border-t">
                <OrderTimeline
                  key={`${selectedOrder.id}:${timelineTick}`}
                  orderId={selectedOrder.id}
                  onOrderChanged={(patch) => {
                    setOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, ...patch } : o));
                    setSelectedOrder(prev => prev ? { ...prev, ...patch } : prev);
                  }}
                />
              </div>

              {/* Test siparişini kalıcı sil — yalnız sitede verilmiş, aktarılmamış sipariş */}
              {!isMarketplace(selectedOrder) && !isImported(selectedOrder) && (
                <div className="pt-3 border-t flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">Test siparişi mi? Kalıcı olarak silebilirsin (stok geri eklenir). Gerçek siparişte “Siparişi iptal et”i kullan.</p>
                  <Button size="sm" variant="outline" disabled={deletingOrder} onClick={() => deleteOrder(selectedOrder)}
                    className="gap-1.5 text-red-700 border-red-200 hover:bg-red-50">
                    {deletingOrder ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Siparişi sil
                  </Button>
                </div>
              )}

            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Yeni Sipariş Dialog ──────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setCreateError(""); } }}>
        <DialogContent className="w-[95vw] sm:max-w-[900px] max-h-[90vh] overflow-y-auto top-[5vh] translate-y-0">
          <DialogHeader>
            <DialogTitle>Yeni Sipariş Oluştur</DialogTitle>
            <DialogDescription>Müşteri ve ürün bilgilerini girerek manuel sipariş oluşturun.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Müşteri arama */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Müşteri</label>
              <div className="relative">
                <Input
                  placeholder="İsim, e-posta veya telefon ile ara…"
                  value={customerQuery}
                  onChange={(e) => {
                    setCustomerQuery(e.target.value);
                    if (!selectedCustomer) searchCustomers(e.target.value);
                    else { setSelectedCustomer(null); setCustomerAddresses([]); setSelectedAddressId(""); }
                  }}
                />
                {customerResults.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg overflow-hidden">
                    {customerResults.map((c) => (
                      <button
                        key={c.id}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between border-b last:border-0"
                        onClick={() => selectCustomer(c)}
                      >
                        <span className="font-medium">{c.first_name} {c.last_name}</span>
                        <span className="text-xs text-muted-foreground">{c.email}{c.phone ? ` · ${c.phone}` : ""}</span>
                      </button>
                    ))}
                    <button
                      className="w-full text-left px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 flex items-center gap-1.5"
                      onClick={openNewCustomer}
                    >
                      <UserPlus size={14} /> Aradığın yok mu? Yeni müşteri ekle
                    </button>
                  </div>
                )}
              </div>
              {!selectedCustomer && !newCustomerOpen && customerSearched && customerResults.length === 0 && (
                <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                  <span>“{customerSearched}” ile kayıtlı müşteri bulunamadı.</span>
                  <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={openNewCustomer}>
                    <UserPlus size={13} /> Yeni müşteri ekle
                  </Button>
                </div>
              )}

              {/* Hızlı yeni müşteri formu */}
              {newCustomerOpen && !selectedCustomer && (
                <div className="border-2 border-blue-100 bg-blue-50/40 rounded-xl p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5"><UserPlus size={15} /> Yeni müşteri</p>
                    <button className="text-xs text-muted-foreground hover:text-slate-800" onClick={() => setNewCustomerOpen(false)}>Vazgeç</button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Input className="h-9 text-sm bg-white" placeholder="Ad" value={newCustomer.firstName} onChange={(e) => setNewCustomer({ ...newCustomer, firstName: e.target.value })} />
                    <Input className="h-9 text-sm bg-white" placeholder="Soyad" value={newCustomer.lastName} onChange={(e) => setNewCustomer({ ...newCustomer, lastName: e.target.value })} />
                    <Input className="h-9 text-sm bg-white" type="email" placeholder="E-posta" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} />
                    <Input className="h-9 text-sm bg-white" inputMode="numeric" placeholder="Telefon (5XX XXX XX XX)" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} />
                    <GeoSelect options={CITIES} value={newCustomer.city} onChange={(city) => setNewCustomer({ ...newCustomer, city, district: "" })} placeholder="İl seçin…" />
                    <GeoSelect options={newCustomer.city ? (DISTRICTS[newCustomer.city] ?? []) : []} value={newCustomer.district} onChange={(district) => setNewCustomer({ ...newCustomer, district })} placeholder={newCustomer.city ? "İlçe seçin…" : "Önce il seçin"} disabled={!newCustomer.city} />
                  </div>
                  <textarea
                    className="w-full text-sm border rounded-lg px-3 py-2 resize-none bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    rows={2}
                    placeholder="Açık adres (mahalle, sokak, bina, daire)"
                    value={newCustomer.addressDetail}
                    onChange={(e) => setNewCustomer({ ...newCustomer, addressDetail: e.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Şifresiz bir üyelik açılır ve bu adres kaydedilir. Sipariş ve kargo bildirimleri e-postaya gider.
                  </p>
                  {newCustomerError && <p className="text-xs font-semibold text-red-600">{newCustomerError}</p>}
                  <div className="flex justify-end">
                    <Button size="sm" className="gap-1.5" onClick={saveNewCustomer} disabled={newCustomerSaving}>
                      {newCustomerSaving ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />} Müşteriyi Ekle ve Seç
                    </Button>
                  </div>
                </div>
              )}
              {selectedCustomer && (
                <div className="bg-slate-50 border rounded-lg px-3 py-2 text-xs text-muted-foreground flex gap-4">
                  <span className="flex items-center gap-1"><Mail size={11} /> {selectedCustomer.email}</span>
                  {selectedCustomer.phone && <span className="flex items-center gap-1"><Phone size={11} /> {selectedCustomer.phone}</span>}
                </div>
              )}
              {selectedCustomer && createdCustomerId === selectedCustomer.id && (
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={sendActivation} onChange={(e) => setSendActivation(e.target.checked)} className="h-3.5 w-3.5" />
                  Yeni müşteriye hesap açma (şifre belirleme) e-postası gönder — sipariş e-postasından sonra gider
                </label>
              )}
            </div>

            {/* Adres seçimi */}
            {customerAddresses.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Teslimat Adresi</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={selectedAddressId}
                  onChange={(e) => setSelectedAddressId(e.target.value)}
                >
                  {customerAddresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.first_name} {a.last_name} — {a.address_detail}, {a.district}, {a.city}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {selectedCustomer && customerAddresses.length === 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Bu müşteriye ait kayıtlı adres bulunamadı.
              </p>
            )}

            {/* Ürünler */}
            <div className="space-y-2">
              <label className="text-sm font-semibold">Ürünler</label>
              <div className="space-y-2">
                {newItems.map((item, idx) => {
                  const results = item.productId ? [] : filterUnits(item.query);
                  const overStock = item.stock > 0 && item.quantity > item.stock;
                  return (
                  <div key={idx} className="border rounded-lg p-3 space-y-2 bg-slate-50/50">
                    {!item.productId ? (
                      /* Ürün arama (çok-kelimeli) */
                      <div className="relative">
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input
                              className="h-9 pl-8 text-sm"
                              placeholder='Ürün ara: "bot kahve 38"…'
                              value={item.query}
                              onChange={(e) => setNewItems(prev => prev.map((it, i) => i === idx ? { ...it, query: e.target.value } : it))}
                            />
                          </div>
                          {newItems.length > 1 && (
                            <button onClick={() => setNewItems(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">
                              <XCircle size={16} />
                            </button>
                          )}
                        </div>
                        {results.length > 0 && (
                          <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                            {results.map((u: any) => {
                              const out = u.stock <= 0;
                              return (
                                <button
                                  key={`${u.productId}_${u.variantId}`}
                                  disabled={out}
                                  className={`w-full text-left px-3 py-2 text-xs border-b last:border-0 flex items-center justify-between gap-2 ${out ? "opacity-50 cursor-not-allowed bg-slate-50" : "hover:bg-blue-50"}`}
                                  onClick={() => !out && selectUnit(idx, u)}
                                >
                                  <span className="min-w-0">
                                    <span className="font-medium text-slate-800 block truncate">{u.title}{u.variantName ? ` · ${u.variantName}` : ""}</span>
                                    <span className="text-slate-400">{u.sku ? `${u.sku} · ` : ""}₺{u.price}</span>
                                  </span>
                                  <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${out ? "bg-red-100 text-red-600" : u.stock <= 3 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                                    {out ? "Tükendi" : `Stok ${u.stock}`}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Seçilen ürün + adet + fiyat */
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">{item.title}{item.variantName ? ` · ${item.variantName}` : ""}</p>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${item.stock <= 3 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>Stok {item.stock}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => setNewItems(prev => prev.map((it, i) => i === idx ? { ...EMPTY_ITEM, quantity: it.quantity } : it))}
                              className="text-[11px] font-bold text-blue-600 hover:text-blue-800">Değiştir</button>
                            {newItems.length > 1 && (
                              <button onClick={() => setNewItems(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 ml-1"><XCircle size={16} /></button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-end gap-3">
                          <div className="w-20">
                            <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Adet</label>
                            <Input type="number" min={1} max={item.stock || undefined} className="h-9 text-sm text-center"
                              value={item.quantity}
                              onChange={(e) => setNewItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Math.max(1, Number(e.target.value)) } : it))} />
                          </div>
                          <div className="w-28">
                            <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">Birim Fiyat (₺)</label>
                            <Input type="number" min={0} step={0.01} className="h-9 text-sm"
                              value={item.unitPrice || ""}
                              onChange={(e) => setNewItems(prev => prev.map((it, i) => i === idx ? { ...it, unitPrice: Number(e.target.value) } : it))} />
                          </div>
                          <div className="flex-1 text-right text-sm font-bold text-slate-700 pb-1.5">
                            ₺{(item.quantity * item.unitPrice).toFixed(2)}
                          </div>
                        </div>
                        {overStock && <p className="text-[10px] text-red-500 font-medium">Adet stoktan fazla (max {item.stock}).</p>}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
              <button
                onClick={() => setNewItems(prev => [...prev, { ...EMPTY_ITEM }])}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
              >
                + Ürün ekle
              </button>

              {/* Özet */}
              {newItems.some(i => i.unitPrice > 0) && (() => {
                const subtotal = newItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
                const m = shipMethods.find((x) => x.id === newShipMethodId);
                const ship = shipFee(m, subtotal, newFreeShipping);
                return (
                  <div className="bg-slate-100 rounded-lg px-3 py-2 text-xs space-y-1">
                    <div className="flex justify-between text-slate-500"><span>Ara toplam</span><span>₺{subtotal.toFixed(2)}</span></div>
                    <div className="flex justify-between text-slate-500"><span>Kargo{m ? ` · ${m.name}` : ""}</span><span>{ship === 0 ? "Ücretsiz" : `₺${ship.toFixed(2)}`}</span></div>
                    <div className="flex justify-between font-bold text-slate-800 border-t pt-1"><span>Toplam</span><span>₺{(subtotal + ship).toFixed(2)}</span></div>
                  </div>
                );
              })()}
            </div>

            {/* Kargo yöntemi — sitedeki aktif yöntemler */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Kargo Yöntemi</label>
              {shipMethods.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aktif kargo yöntemi yok (Ayarlar › Genel › Kargo Yöntemleri).</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {shipMethods.map((m) => {
                    const subtotal = newItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
                    const fee = shipFee(m, subtotal, newFreeShipping);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setNewShipMethodId(m.id)}
                        className={`flex-1 min-w-[120px] py-2 px-2 text-xs font-semibold rounded-lg border transition ${newShipMethodId === m.id ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}
                      >
                        {m.name} · {fee === 0 ? "Ücretsiz" : `₺${fee.toFixed(2)}`}
                      </button>
                    );
                  })}
                </div>
              )}
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={newFreeShipping} onChange={(e) => setNewFreeShipping(e.target.checked)} className="h-3.5 w-3.5" />
                Kargo ücreti alma (ücretsiz gönder)
              </label>
            </div>

            {/* Ödeme yöntemi */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Ödeme Yöntemi</label>
              <div className="flex gap-2">
                {[
                  { value: "credit_card", label: "Kredi Kartı" },
                  { value: "bank_transfer", label: "Havale/EFT" },
                  { value: "cash", label: "Nakit" },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setNewPaymentMethod(opt.value)}
                    className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition ${newPaymentMethod === opt.value ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Admin notu */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Admin Notu <span className="text-muted-foreground font-normal">(isteğe bağlı)</span></label>
              <textarea
                className="w-full text-sm border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 bg-amber-50/50 border-amber-200"
                rows={2}
                placeholder="Sadece adminler görebilir…"
                value={newAdminNote}
                onChange={(e) => setNewAdminNote(e.target.value)}
              />
            </div>

            {createError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                <AlertCircle size={14} /> {createError}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setCreateOpen(false)} disabled={creatingOrder}>
                İptal
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={submitNewOrder}
                disabled={creatingOrder || !selectedCustomer || !selectedAddressId || newItems.every(i => !i.productId)}
              >
                {creatingOrder ? <Loader2 size={15} className="animate-spin" /> : <Package size={15} />}
                {creatingOrder ? "Oluşturuluyor…" : "Siparişi Oluştur"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Pazaryeri sipariş paneli ─────────────────────────────────────────────────
// Pazaryeri no + durum + kargo takibi; eşleşmeyen ürün / fazla satış uyarısı ("Gördüm");
// pazaryerinde İADE olan siparişte "İadeyi stoğa ekle" (admin onayıyla, tek seferlik).
function MarketplaceOrderPanel({ order, onChange, onRestocked }: {
  order: Order;
  onChange: (fields: Partial<Order>) => void;
  onRestocked: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const returned = order.status === "refunded" || order.shipment_status === "returned";

  async function ack() {
    setBusy(true);
    const { error } = await (supabase as any).from("orders").update({ mp_warning_ack: true }).eq("id", order.id);
    setBusy(false);
    if (!error) onChange({ mp_warning_ack: true });
  }
  async function restock() {
    setBusy(true); setMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/admin/orders/marketplace-restock", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ orderId: order.id }),
      });
      const j = await r.json().catch(() => ({}));
      setMsg(r.ok ? (j.restored > 0 ? `${j.restored} adet stoğa eklendi; pazaryerlerine gönderiliyor.` : "Eklenecek stok yok (zaten eklenmiş ya da düşülmemiş).") : (j.error || "Hata"));
      if (r.ok) onRestocked();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border-2 border-orange-100 bg-orange-50/40 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span><span className="text-muted-foreground">{CHANNEL_FALLBACK.find((c) => c.code === order.channel)?.label ?? order.channel} sipariş no:</span> <b className="font-mono">{order.external_order_number || "—"}</b></span>
        <span><span className="text-muted-foreground">Pazaryeri durumu:</span> <b>{order.external_status || "—"}</b></span>
        {order.cargo_provider && <span><span className="text-muted-foreground">Kargo:</span> <b>{order.cargo_provider}</b></span>}
        {order.cargo_tracking_number && (
          <span className="flex items-center gap-1">
            <span className="text-muted-foreground">Takip:</span>
            {order.cargo_tracking_url
              ? <a href={order.cargo_tracking_url} target="_blank" rel="noopener noreferrer" className="font-mono text-blue-600 hover:underline flex items-center gap-1">{order.cargo_tracking_number} <ExternalLink size={11} /></a>
              : <b className="font-mono">{order.cargo_tracking_number}</b>}
          </span>
        )}
      </div>
      {(order.customer_email || order.customer_phone) && (
        <p className="text-xs text-slate-600">
          {order.customer_name}{order.customer_email ? ` · ${order.customer_email}` : ""}{order.customer_phone ? ` · ${order.customer_phone}` : ""}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        Ödeme ve sevkiyat durumu pazaryerinden otomatik güncellenir; müşteriye bizden e-posta gitmez. Faturayı aşağıdan yönetebilirsin.
      </p>

      {order.mp_warning && !order.mp_warning_ack && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 space-y-2">
          <p className="font-bold flex items-center gap-1.5"><AlertCircle size={13} /> Dikkat</p>
          <p className="whitespace-pre-line">{order.mp_warning}</p>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={ack}>Gördüm</Button>
        </div>
      )}

      {returned ? (
        // Stoğa ekleme "Sıradaki adım" panelinde (tek akış)
        <p className="text-xs text-amber-800">Bu sipariş pazaryerinde <b>iade</b> durumunda — ürün depoya dönünce yukarıdaki “Sıradaki adım”dan stoğa ekle.</p>
      ) : order.status !== "cancelled" && (
        // Hepsiburada iade bilgisi otomatik gelmiyor → ürün geri geldiyse elle
        <button
          className="text-[11px] text-slate-500 hover:text-slate-800 underline"
          disabled={busy}
          onClick={async () => {
            if (await siteConfirm({ title: "İade geldi mi?", message: "Bu siparişin ürünleri depoya döndüyse ve satılabilir durumdaysa stoğa eklenir; yeni stok tüm pazaryerlerine gönderilir.", confirmText: "Stoğa ekle" })) restock();
          }}
        >
          İade geldi, ürünleri stoğa ekle
        </button>
      )}
      {msg && <p className="text-xs font-semibold text-slate-700">{msg}</p>}
    </div>
  );
}

// ─── Eski siteden aktarılan sipariş bilgisi ──────────────────────────────────
const IMPORT_SOURCE_LABEL: Record<string, string> = { woo_yerihisset: "yerihisset.com (eski site)", woo_attipas: "attipas.com.tr" };

function ImportedOrderPanel({ order, channels }: { order: Order; channels: SalesChannel[] }) {
  const raw = (order.external_raw ?? {}) as any;
  const ch = channels.find((c) => c.code === (order.channel || "site"));
  const rows: [string, React.ReactNode][] = [
    ["Kaynak", `${IMPORT_SOURCE_LABEL[order.import_source ?? ""] ?? order.import_source} · ${ch?.label ?? order.channel}`],
    ["Eski sipariş no", <b key="no" className="font-mono">#{order.external_order_number || order.import_ref}</b>],
  ];
  if (raw.payment_title) rows.push(["Ödeme yöntemi", raw.payment_title]);
  if (raw.wc_status) rows.push(["Eski sitedeki durum", raw.wc_status]);
  if (Array.isArray(raw.coupons) && raw.coupons.length) rows.push(["Kupon", raw.coupons.join(", ")]);
  if (Number(order.extra_fee) > 0) rows.push(["Ek ücret", `₺${Number(order.extra_fee).toFixed(2)}${raw.fee_names?.length ? ` (${raw.fee_names.join(", ")})` : ""}`]);
  if (raw.utm_source) rows.push(["Geldiği kaynak", [raw.utm_source, raw.utm_medium].filter(Boolean).join(" / ")]);
  if (order.customer_note) rows.push(["Müşteri notu", order.customer_note]);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Eski siteden aktarıldı · stok düşülmedi</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
        {rows.map(([k, v]) => (
          <span key={k}><span className="text-muted-foreground">{k}:</span> {v}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Sipariş işlemleri penceresi: iptal / iade al / ücret iadesi ─────────────
// Senaryo matrisi (migration 20261020000001): durum kolonları, stok, ciro ve sipariş
// geçmişi sunucuda TEK işlemle değişir (/api/admin/orders/action). Para iadesi stoğa
// dokunmaz; stok yalnız ürün depoya dönünce (iptalde otomatik, iadede "stoğa ekle" ile).
function OrderActionDialog({ mode, order, onClose, onDone }: {
  mode: "cancel" | "return" | "refund";
  order: Order;
  onClose: () => void;
  onDone: (fresh: any) => void;
}) {
  const total = Number(order.total_amount || 0);
  const refunded = Number(order.refunded_amount || 0);
  const remaining = Math.round((total - refunded) * 100) / 100;
  const paidNow = order.payment_status === "paid" || order.payment_status === "partial_refund";
  const iyzicoOk = order.payment_method === "iyzico" && !!order.iyzico_payment_id;
  const [method, setMethod] = useState(iyzicoOk ? "iyzico" : "bank_transfer");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState(mode === "refund" ? String(remaining) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const items = (order.order_items ?? []).map((i) => ({ ...i, left: Number(i.quantity) - Number(i.returned_qty || 0) }));
  const [ret, setRet] = useState<Record<string, { on: boolean; qty: number; restock: boolean }>>(() =>
    Object.fromEntries(items.filter((i) => i.left > 0).map((i) => [i.id, { on: true, qty: i.left, restock: true }])));
  const [withRefund, setWithRefund] = useState(paidNow);
  const retSum = Math.min(remaining, Math.round(items.reduce((a, i) => a + (ret[i.id]?.on ? Number(i.unit_price) * (ret[i.id]?.qty || 0) : 0), 0) * 100) / 100);
  const [retAmount, setRetAmount] = useState<string | null>(null);

  // Para iadesi bu işlemde yapılıyor mu? (iptal/ücret iadesi: ödeme alınmışsa; iade al: işaretliyse)
  const refundNow = paidNow && (mode === "cancel" ? remaining > 0 : mode === "refund" ? true : withRefund);
  // iyzico (otomatik) dışındaki yöntemlerde parayı admin gönderir → "yaptım" onayı istenir;
  // müşteriye giden e-posta "iaden yapıldı" der, bu yüzden gerçekten yapılmış olmalı
  const needsConfirm = refundNow && method !== "iyzico";
  const [confirmed, setConfirmed] = useState(false);
  const confirmText: Record<string, string> = {
    iyzico_manual: "Kart iadesini iyzico panelinden yaptım",
    bank_transfer: "Parayı müşterinin banka hesabına gönderdim",
    cash: "Nakit iadeyi yaptım",
    other: "İadeyi yaptım",
  };

  async function submit() {
    setBusy(true); setErr(null);
    try {
      if (needsConfirm && !confirmed) throw new Error("Önce iadeyi yaptığını onayla.");
      const body: any = { action: mode, orderId: order.id, note: note.trim() || undefined, confirmed: needsConfirm ? true : undefined };
      if (mode === "refund") { body.amount = Number(String(amount).replace(",", ".")); body.method = method; }
      if (mode === "cancel") body.method = method;
      if (mode === "return") {
        body.items = items.filter((i) => ret[i.id]?.on && ret[i.id].qty > 0).map((i) => ({ item_id: i.id, qty: ret[i.id].qty, restock: ret[i.id].restock }));
        if (!body.items.length) throw new Error("İade gelen ürünü seç.");
        if (withRefund && paidNow) body.refund = { amount: Number(String(retAmount ?? retSum).replace(",", ".")), method, note: note.trim() || undefined };
      }
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/admin/orders/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "İşlem yapılamadı");
      onDone(j.order);
    } catch (e: any) {
      setErr(e?.message || "İşlem yapılamadı");
    } finally {
      setBusy(false);
    }
  }

  const sel = "w-full h-9 rounded-lg border border-input bg-background px-2 text-sm";
  const methodSelect = (
    <label className="block space-y-1">
      <span className="text-xs font-semibold">İade yöntemi</span>
      <select value={method} onChange={(e) => setMethod(e.target.value)} className={sel}>
        {iyzicoOk && <option value="iyzico">Kart — iyzico'dan şimdi otomatik iade et (önerilen)</option>}
        {iyzicoOk && <option value="iyzico_manual">Kart — iadeyi iyzico panelinden kendim yaptım (yalnız kaydet)</option>}
        <option value="bank_transfer">Havale/EFT — parayı müşterinin hesabına ben gönderdim</option>
        <option value="cash">Kapıda / nakit</option>
        <option value="other">Diğer</option>
      </select>
      {method === "iyzico" && <span className="block text-[11px] text-muted-foreground">Tutar müşterinin kartına iyzico üzerinden hemen iade edilir; ayrıca bir şey yapmana gerek yok.</span>}
    </label>
  );
  const confirmBox = needsConfirm && (
    <label className="flex items-start gap-2 rounded-lg border-2 border-amber-200 bg-amber-50 p-2.5 text-xs font-semibold text-amber-900">
      <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
      <span>{confirmText[method] ?? "İadeyi yaptım"} — müşteriye “iaden yapıldı” e-postası gidecek.</span>
    </label>
  );
  const title = mode === "cancel" ? "Siparişi iptal et" : mode === "return" ? "İade al (ürün geri geldi)" : "Ücret iadesi yap";

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4 text-sm">
          {mode === "cancel" && (
            <>
              <ul className="text-xs text-slate-600 space-y-1 list-disc pl-4">
                <li>Kargo <b>İptal</b>, sipariş <b>İptal</b> olur; düşülen stok <b>geri eklenir</b> (ürün depodan çıkmadı).</li>
                <li>Fatura kesilmediyse <b>Gerekmiyor</b> olur{(order.invoice_status || "pending") === "invoiced" ? <> — <b className="text-amber-700">fatura kesilmiş: iade faturası gerekecek</b></> : null}.</li>
                {paidNow
                  ? <li>Ödeme alınmış: <b>₺{remaining.toFixed(2)}</b> ücret iadesi yapılır, ödeme <b>İade edildi</b> olur; kullanılan YeriHisset Kredisi cüzdana döner.</li>
                  : <li>Ödeme alınmamış: ödeme <b>Alınmadı</b> olur.</li>}
                <li>Müşteriye iptal e-postası gider (ödeme alındıysa iadenin nasıl yapıldığını da yazar).</li>
              </ul>
              {paidNow && methodSelect}
              {confirmBox}
            </>
          )}

          {mode === "refund" && (
            <>
              <label className="block space-y-1">
                <span className="text-xs font-semibold">Tutar (en çok ₺{remaining.toFixed(2)})</span>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={sel} />
              </label>
              {methodSelect}
              {confirmBox}
              <p className="text-[11px] text-muted-foreground">Ücret iadesi stoğa ve kargoya dokunmaz. Tamamı iade edilirse ödeme “İade edildi”, bir kısmıysa “Kısmi iade” olur; ciro buna göre düşer.</p>
            </>
          )}

          {mode === "return" && (
            <>
              <div className="space-y-2">
                <p className="text-xs font-semibold">Geri gelen ürünler</p>
                {items.map((i) => {
                  const st = ret[i.id];
                  if (i.left <= 0) return (
                    <div key={i.id} className="text-xs text-slate-400">{i.products?.title || i.title || i.sku} — iade alındı</div>
                  );
                  return (
                    <div key={i.id} className="rounded-lg border p-2.5 space-y-1.5">
                      <label className="flex items-center gap-2 font-medium text-xs">
                        <input type="checkbox" checked={!!st?.on} onChange={(e) => setRet((r) => ({ ...r, [i.id]: { ...r[i.id], on: e.target.checked } }))} />
                        {i.products?.title || i.title || i.sku}{i.variant_name ? ` · ${i.variant_name}` : ""}
                      </label>
                      {st?.on && (
                        <div className="flex flex-wrap items-center gap-3 pl-6 text-xs">
                          <span>Adet:</span>
                          <input type="number" min={1} max={i.left} value={st.qty}
                            onChange={(e) => setRet((r) => ({ ...r, [i.id]: { ...r[i.id], qty: Math.max(1, Math.min(i.left, Number(e.target.value) || 1)) } }))}
                            className="w-16 h-7 rounded-md border px-2" />
                          <span className="text-slate-400">/ {i.left}</span>
                          <label className="flex items-center gap-1.5">
                            <input type="checkbox" checked={st.restock} onChange={(e) => setRet((r) => ({ ...r, [i.id]: { ...r[i.id], restock: e.target.checked } }))} />
                            Stoğa ekle (ürün sağlam)
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
                <p className="text-[11px] text-muted-foreground">Kusurlu ürünü stoğa ekleme. Tüm ürünler gelirse kargo “İade geldi” olur; bir kısmıysa kargo değişmez, sipariş geçmişine not düşer.</p>
              </div>
              {paidNow && (
                <div className="rounded-lg border p-3 space-y-2">
                  <label className="flex items-center gap-2 text-xs font-semibold">
                    <input type="checkbox" checked={withRefund} onChange={(e) => setWithRefund(e.target.checked)} /> Ücret iadesini de şimdi yap
                  </label>
                  {withRefund && (
                    <>
                      <label className="block space-y-1">
                        <span className="text-xs">Tutar (seçilen ürünlere göre önerildi; en çok ₺{remaining.toFixed(2)})</span>
                        <input value={retAmount ?? String(retSum)} onChange={(e) => setRetAmount(e.target.value)} inputMode="decimal" className={sel} />
                      </label>
                      {methodSelect}
                      {confirmBox}
                    </>
                  )}
                  {!withRefund && <p className="text-[11px] text-muted-foreground">Ücret iadesini sonra “Ücret iadesi yap” ile girebilirsin; o zamana kadar sipariş “İade geldi, ücret iade edilmedi” filtresinde görünür.</p>}
                </div>
              )}
            </>
          )}

          <label className="block space-y-1">
            <span className="text-xs font-semibold">Not (sipariş geçmişine yazılır)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "cancel" ? "ör. stoktaki üründe sorun, müşteriyle görüşüldü" : "ör. numara küçük geldi"} className={sel} />
          </label>
          {err && <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-slate-50 rounded-b-2xl">
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>Vazgeç</Button>
          <Button size="sm" onClick={submit} disabled={busy || (needsConfirm && !confirmed)} className={mode === "cancel" ? "bg-red-600 hover:bg-red-700" : ""}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : title}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Satış sonrası talep kutusu (değişim / iade) ─────────────────────────────
// Müşterinin isteği, kargo yöntemi, IBAN; kod / alternatif gönderme girişleri. Kurallar: order-next-step.
const RETURN_METHODS: Record<string, string> = { ups: "UPS adresten alım", surat: "Sürat şubesine teslim", aras: "Aras şubesine teslim" };
const CASE_STATUS: Record<string, string> = {
  requested: "Talep alındı", waiting_stock: "Stok bekleniyor", alt_shipped: "Alternatif kargoda", alt_delivered: "Müşteri deniyor",
  keep_chosen: "Müşteri seçti", label_sent: "Kargo kodu gönderildi",
};
function CaseBox({ order, kase, canSendLabel, canShipAlt, onDone }: {
  order: Order; kase: any; canSendLabel: boolean; canShipAlt: boolean; onDone: () => void;
}) {
  const [method, setMethod] = useState<string>(kase.return_method || "surat");
  const [code, setCode] = useState("");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  const items: any[] = (order as any).order_items || [];
  const label = (id: string) => { const i = items.find((x) => x.id === id); return i ? `${i.products?.title ?? i.title ?? "Ürün"}${i.variant_name ? ` (${i.variant_name})` : ""}` : "—"; };

  async function call(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/admin/orders/case", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ orderId: order.id, ...payload }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { siteAlert({ message: d.error || "İşlem yapılamadı", tone: "danger" }); return; }
      siteAlert({ message: d.email === "failed" ? "Kaydedildi ama müşteriye e-posta gönderilemedi." : "Kaydedildi.", tone: d.email === "failed" ? "danger" : "success" });
      onDone();
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-lg border border-purple-200 bg-white p-3 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-purple-800">{kase.kind === "exchange" ? "Değişim talebi" : "İade talebi"}</span>
        <span className="rounded-full bg-purple-50 text-purple-700 px-2 py-0.5">{CASE_STATUS[kase.status] ?? kase.status}</span>
        <span className="text-muted-foreground ml-auto">{new Date(kase.created_at).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      {kase.reason && <p><span className="text-muted-foreground">Sebep:</span> {kase.reason === "small" ? "Küçük geldi" : kase.reason === "big" ? "Büyük geldi" : kase.reason}</p>}
      {(kase.items || []).map((x: any, i: number) => (
        <p key={i}>
          {label(x.order_item_id)}
          {kase.kind === "exchange" && <> → <b>{x.want_label || "numara seçmedi"}</b>{x.wait ? <span className="text-amber-700"> · stok bekliyor</span> : null}</>}
        </p>
      ))}
      {kase.keep_item_id && <p><span className="text-muted-foreground">Tuttuğu:</span> <b>{label(kase.keep_item_id)}</b> — diğeri geri gelecek</p>}
      {kase.return_method && <p><span className="text-muted-foreground">Kargo:</span> {RETURN_METHODS[kase.return_method] ?? kase.return_method}{kase.return_code ? <> · kod <code className="font-mono">{kase.return_code}</code></> : null}</p>}
      {kase.alt_tracking && <p><span className="text-muted-foreground">Alternatif takip:</span> <code className="font-mono">{kase.alt_tracking}</code></p>}
      {kase.iban && <p><span className="text-muted-foreground">IBAN (havale iadesi):</span> <code className="font-mono select-all">{kase.iban}</code></p>}
      {kase.customer_note && <p className="whitespace-pre-wrap"><span className="text-muted-foreground">Müşteri notu:</span> {kase.customer_note}</p>}

      {canShipAlt && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
          <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Kargo takip no (opsiyonel)" className="h-8 flex-1 min-w-[160px] rounded-md border px-2" />
          <Button size="sm" disabled={busy} onClick={async () => {
            if (await siteConfirm({ title: "Alternatif gönderilsin mi?", message: "İstenen numara siparişe eklenir ve stoğu düşer.", confirmText: "Gönder" })) call({ op: "ship_alt", tracking });
          }}>Alternatifi gönder</Button>
        </div>
      )}
      {canSendLabel && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="h-8 rounded-md border px-2 bg-white">
            {Object.entries(RETURN_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Kargonomi kargo kodu" className="h-8 flex-1 min-w-[140px] rounded-md border px-2 font-mono" />
          <Button size="sm" disabled={busy || !code.trim()} onClick={() => call({ op: "send_label", method, code })}>Kodu müşteriye gönder</Button>
        </div>
      )}
    </div>
  );
}
