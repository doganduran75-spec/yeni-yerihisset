"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase";
import {
  Eye, MoreVertical, Loader2, Package, Truck, CheckCircle, XCircle,
  Clock, MapPin, Phone, Mail, Users, ShoppingBag, Copy, ExternalLink,
  Landmark, FileText, ChevronDown, AlertCircle, Send,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type OrderItem = {
  id: string;
  quantity: number;
  unit_price: number;
  product_id: string;
  variant_id?: string | null;
  sku?: string | null;
  variant_name?: string | null;
  products: { title: string } | null;
};

type Order = {
  id: string;
  order_number?: number | null;
  total_amount: number;
  status: string;
  created_at: string;
  shipping_address: string;
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
  profiles: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  } | null;
  order_items?: OrderItem[];
};

// ─── Ödeme Durumu ─────────────────────────────────────────────────────────────

const paymentColors: Record<string, string> = {
  pending:  "bg-amber-50  text-amber-700  ring-amber-500/20",
  paid:     "bg-green-50  text-green-700  ring-green-500/20",
  failed:   "bg-red-50    text-red-700    ring-red-500/20",
};
const paymentLabels: Record<string, string> = {
  pending: "Bekleniyor",
  paid:    "Ödendi",
  failed:  "Başarısız",
};

// ─── Sevkiyat Durumu ──────────────────────────────────────────────────────────

const shipmentColors: Record<string, string> = {
  waiting:    "bg-slate-50   text-slate-500  ring-slate-400/20",
  preparing:  "bg-blue-50    text-blue-700   ring-blue-500/20",
  shipped:    "bg-purple-50  text-purple-700 ring-purple-500/20",
  delivered:  "bg-green-50   text-green-700  ring-green-500/20",
  cancelled:  "bg-red-50     text-red-700    ring-red-500/20",
};
const shipmentLabels: Record<string, string> = {
  waiting:   "Bekleniyor",
  preparing: "Hazırlanıyor",
  shipped:   "Kargoya Verildi",
  delivered: "Teslim Edildi",
  cancelled: "İptal Edildi",
};

// ─── Fatura Durumu ────────────────────────────────────────────────────────────

const invoiceColors: Record<string, string> = {
  pending:  "bg-slate-50  text-slate-500  ring-slate-400/20",
  invoiced: "bg-teal-50   text-teal-700   ring-teal-500/20",
};
const invoiceLabels: Record<string, string> = {
  pending:  "Bekleniyor",
  invoiced: "Faturalandı",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const searchParams = useSearchParams();
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
    { sku: "", productId: "", variantId: "", variantName: "", title: "", quantity: 1, unitPrice: 0, skuError: "", skuLoading: false },
  ]);
  const [newPaymentMethod, setNewPaymentMethod] = useState("credit_card");
  const [newAdminNote, setNewAdminNote] = useState("");
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [createError, setCreateError] = useState("");
  const [skuDropdown, setSkuDropdown] = useState<{ idx: number; results: any[] } | null>(null);

  // ─── iyzico İade state ────────────────────────────────────────────────────
  const [refundAmount, setRefundAmount] = useState("");
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundResult, setRefundResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => { fetchOrders(); }, []);

  // URL'den ?id=xxx gelirse ilgili siparişi otomatik aç
  useEffect(() => {
    const targetId = searchParams.get("id");
    if (!targetId || loading || orders.length === 0) return;
    const order = orders.find(o => o.id === targetId);
    if (order) handleViewDetails(order);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loading, orders.length]);

  async function fetchOrders() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select(`*, profiles(first_name, last_name, email, phone)`)
        .order("created_at", { ascending: false });

      if (error) {
        const { data: simple } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
        setOrders((simple as any) || []);
        return;
      }
      setOrders((data as any) || []);
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

  async function handleRefund(orderId: string) {
    const amt = parseFloat(refundAmount);
    if (isNaN(amt) || amt <= 0) {
      setRefundResult({ ok: false, msg: "Geçerli bir tutar girin." });
      return;
    }
    setRefundLoading(true);
    setRefundResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/orders/refund", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ orderId, amount: amt }),
      });
      const data = await res.json();
      if (data.ok) {
        setRefundResult({ ok: true, msg: `✓ ₺${amt.toFixed(2)} iade başarıyla gerçekleşti.` });
        // Local state güncelle
        const newRefunded = data.totalRefunded;
        const isFull = data.refundStatus === "full";
        setSelectedOrder(prev => prev ? {
          ...prev,
          refund_status: data.refundStatus,
          refunded_amount: newRefunded,
          payment_status: isFull ? "refunded" : prev.payment_status,
          status: isFull ? "refunded" : prev.status,
        } : prev);
        setOrders(prev => prev.map(o => o.id === orderId ? {
          ...o,
          refund_status: data.refundStatus,
          refunded_amount: newRefunded,
        } : o));
      } else {
        setRefundResult({ ok: false, msg: data.error ?? "İade başarısız." });
      }
    } catch {
      setRefundResult({ ok: false, msg: "Bağlantı hatası." });
    } finally {
      setRefundLoading(false);
    }
  }

  // ─── Yeni Sipariş fonksiyonları ───────────────────────────────────────────

  async function searchCustomers(q: string) {
    if (q.length < 2) { setCustomerResults([]); return; }
    const { data } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email, phone")
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(8);
    setCustomerResults(data ?? []);
  }

  async function selectCustomer(customer: any) {
    setSelectedCustomer(customer);
    setCustomerQuery(`${customer.first_name} ${customer.last_name}`);
    setCustomerResults([]);
    const { data: addrs } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("user_id", customer.id);
    setCustomerAddresses(addrs ?? []);
    setSelectedAddressId(addrs?.[0]?.id ?? "");
  }

  async function handleNewItemSkuLookup(idx: number, sku: string) {
    const trimmed = sku.trim();
    setNewItems(prev => prev.map((item, i) => i === idx ? { ...item, sku: trimmed, skuLoading: true, skuError: "" } : item));
    if (!trimmed) {
      setNewItems(prev => prev.map((item, i) => i === idx ? { ...item, skuLoading: false } : item));
      return;
    }
    const { data: variant } = await (supabase
      .from("product_variants")
      .select("id, sku, price, product_id, products(title), variant_options(value, variant_groups(name))")
      .eq("sku", trimmed)
      .maybeSingle() as any) as { data: any };

    if (!variant) {
      setNewItems(prev => prev.map((item, i) => i === idx
        ? { ...item, skuLoading: false, skuError: `"${trimmed}" SKU bulunamadı` }
        : item));
      return;
    }
    const opt = variant.variant_options;
    const variantName = opt?.value && opt?.variant_groups?.name ? `${opt.variant_groups.name}: ${opt.value}` : (opt?.value ?? "");
    setNewItems(prev => prev.map((item, i) => i === idx ? {
      ...item,
      sku: trimmed,
      productId: variant.product_id,
      variantId: variant.id,
      variantName,
      title: variant.products?.title ?? "",
      unitPrice: variant.price ?? item.unitPrice,
      skuLoading: false,
      skuError: "",
    } : item));
  }

  async function searchSkuDropdown(idx: number, query: string) {
    const q = query.trim();
    if (q.length < 1) { setSkuDropdown(null); return; }
    const { data } = await (supabase
      .from("product_variants")
      .select("id, sku, price, product_id, products(title), variant_options(value, variant_groups(name))")
      .ilike("sku", `${q}%`)
      .limit(8) as any);
    setSkuDropdown({ idx, results: data ?? [] });
  }

  function selectSkuFromDropdown(idx: number, variant: any) {
    const opt = variant.variant_options;
    const variantName = opt?.value && opt?.variant_groups?.name
      ? `${opt.variant_groups.name}: ${opt.value}`
      : (opt?.value ?? "");
    setNewItems(prev => prev.map((item, i) => i === idx ? {
      ...item,
      sku: variant.sku,
      productId: variant.product_id,
      variantId: variant.id,
      variantName,
      title: variant.products?.title ?? "",
      unitPrice: variant.price ?? item.unitPrice,
      skuError: "",
      skuLoading: false,
    } : item));
    setSkuDropdown(null);
  }

  async function submitNewOrder() {
    if (!selectedCustomer) { setCreateError("Müşteri seçin"); return; }
    if (!selectedAddressId) { setCreateError("Adres seçin"); return; }
    if (newItems.some(i => !i.productId)) { setCreateError("Tüm ürün kodlarını doğrulayın"); return; }
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
          admin_note: newAdminNote,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setCreateError(json.error ?? "Hata oluştu"); return; }
      setCreateOpen(false);
      setCustomerQuery(""); setSelectedCustomer(null); setCustomerAddresses([]); setSelectedAddressId("");
      setNewItems([{ sku: "", productId: "", variantId: "", variantName: "", title: "", quantity: 1, unitPrice: 0, skuError: "", skuLoading: false }]);
      setNewAdminNote(""); setNewPaymentMethod("credit_card");
      await fetchOrders();
    } catch {
      setCreateError("Bağlantı hatası");
    } finally {
      setCreatingOrder(false);
    }
  }

  async function handleViewDetails(order: Order) {
    setSelectedOrder(order);
    setIsDetailsOpen(true);
    setItemsLoading(true);
    setSkuEdits({});
    setAdminNote((order as any).admin_note ?? "");
    setRefundAmount(String(order.total_amount ?? ""));
    setRefundResult(null);
    try {
      const { data } = await supabase
        .from("order_items")
        .select("id, quantity, unit_price, product_id, variant_id, sku, variant_name, products(title)")
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

  // SKU değişince ürün ara ve başlığı güncelle
  async function handleSkuLookup(itemId: string, newSku: string) {
    const trimmed = newSku.trim();
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

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sipariş / Müşteri</TableHead>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Tutar</TableHead>
                  <TableHead>Ödeme</TableHead>
                  <TableHead>Sevkiyat</TableHead>
                  <TableHead>Fatura</TableHead>
                  <TableHead className="text-right">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => {
                  const pStatus = order.payment_status  || "pending";
                  const sStatus = order.shipment_status || "waiting";
                  const iStatus = order.invoice_status  || "pending";
                  const isUpdating = updatingId === order.id;

                  return (
                    <TableRow key={order.id} className="group hover:bg-muted/50 transition-colors">
                      {/* Sipariş / Müşteri */}
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-mono text-[11px] font-bold text-blue-600">
                            YH{order.order_number ?? order.id.slice(0, 8).toUpperCase()}
                          </span>
                          <span className="font-medium text-sm">
                            {order.profiles?.first_name} {order.profiles?.last_name}
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
                      </TableCell>

                      {/* Ödeme durumu + aksiyon */}
                      <TableCell>
                        {isUpdating ? (
                          <Loader2 size={14} className="animate-spin text-muted-foreground" />
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger render={
                              <button className="flex items-center gap-1 group/btn">
                                <StatusBadge label={paymentLabels[pStatus] ?? pStatus} color={paymentColors[pStatus] ?? paymentColors.pending} />
                                <ChevronDown size={11} className="text-muted-foreground opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                              </button>
                            } />
                            <DropdownMenuContent align="start" className="w-36">
                              <DropdownMenuItem className="gap-2 text-xs text-green-700" onClick={() => markPaymentPaid(order.id)}>
                                <CheckCircle size={13} /> Ödendi
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2 text-xs text-red-600" onClick={() => updateField(order.id, { payment_status: "failed" })}>
                                <XCircle size={13} /> Başarısız
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2 text-xs text-amber-700" onClick={() => updateField(order.id, { payment_status: "pending" })}>
                                <Clock size={13} /> Bekleniyor
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>

                      {/* Sevkiyat durumu + aksiyon */}
                      <TableCell>
                        {isUpdating ? (
                          <Loader2 size={14} className="animate-spin text-muted-foreground" />
                        ) : (
                          <div className="flex flex-col gap-1">
                            <DropdownMenu>
                              <DropdownMenuTrigger render={
                                <button className="flex items-center gap-1 group/btn">
                                  <StatusBadge label={shipmentLabels[sStatus] ?? sStatus} color={shipmentColors[sStatus] ?? shipmentColors.waiting} />
                                  <ChevronDown size={11} className="text-muted-foreground opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                                </button>
                              } />
                              <DropdownMenuContent align="start" className="w-44">
                                <DropdownMenuItem className="gap-2 text-xs" onClick={() => updateField(order.id, { shipment_status: "preparing" })}>
                                  <Package size={13} className="text-blue-500" /> Hazırlanıyor
                                </DropdownMenuItem>
                                {!order.kargonomi_tracking_code && (
                                  <DropdownMenuItem className="gap-2 text-xs text-purple-700" onClick={() => openShipDialog(order)}>
                                    <Send size={13} className="text-purple-500" /> Kargoya Ver (Kargonomi)
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem className="gap-2 text-xs" onClick={() => updateField(order.id, { shipment_status: "shipped" })}>
                                  <Truck size={13} className="text-purple-500" /> Kargoya Verildi (Manuel)
                                </DropdownMenuItem>
                                <DropdownMenuItem className="gap-2 text-xs text-green-700" onClick={() => updateField(order.id, { shipment_status: "delivered" })}>
                                  <CheckCircle size={13} /> Teslim Edildi
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="gap-2 text-xs text-red-600" onClick={() => updateField(order.id, { shipment_status: "cancelled" })}>
                                  <XCircle size={13} /> İptal Edildi
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
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
                          <DropdownMenu>
                            <DropdownMenuTrigger render={
                              <button className="flex items-center gap-1 group/btn">
                                <StatusBadge label={invoiceLabels[iStatus] ?? iStatus} color={invoiceColors[iStatus] ?? invoiceColors.pending} />
                                <ChevronDown size={11} className="text-muted-foreground opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                              </button>
                            } />
                            <DropdownMenuContent align="start" className="w-36">
                              <DropdownMenuItem className="gap-2 text-xs text-teal-700" onClick={() => updateField(order.id, { invoice_status: "invoiced" })}>
                                <FileText size={13} /> Faturalandı
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2 text-xs text-slate-500" onClick={() => updateField(order.id, { invoice_status: "pending" })}>
                                <Clock size={13} /> Bekleniyor
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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
              Sipariş #{shipDialogOrder?.id.slice(0, 8).toUpperCase()} — Kargonomi üzerinden gönderi oluşturulacak.
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
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Sipariş Detayı
              <span className="text-sm font-mono font-bold text-blue-600">
                YH{selectedOrder?.order_number ?? selectedOrder?.id.slice(0, 8).toUpperCase()}
              </span>
            </DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6 py-2">

              {/* Müşteri + Adres */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Users size={13} /> Müşteri
                  </h4>
                  <div className="text-sm space-y-1 bg-muted/30 p-3 rounded-lg border">
                    <p className="font-semibold">{selectedOrder.profiles?.first_name} {selectedOrder.profiles?.last_name}</p>
                    <p className="text-muted-foreground flex items-center gap-1.5"><Mail size={11} /> {selectedOrder.profiles?.email}</p>
                    <p className="text-muted-foreground flex items-center gap-1.5"><Phone size={11} /> {selectedOrder.profiles?.phone || "—"}</p>
                    {selectedOrder.payment_method === "bank_transfer" && (
                      <p className="text-amber-600 flex items-center gap-1.5 font-medium"><Landmark size={11} /> Havale / EFT</p>
                    )}
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

              {/* 3 Boyutlu Durum */}
              <div className="grid grid-cols-3 gap-3">
                {/* Ödeme */}
                <div className="border rounded-xl p-3 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Ödeme</p>
                  <StatusBadge
                    label={paymentLabels[selectedOrder.payment_status || "pending"] ?? (selectedOrder.payment_status || "pending")}
                    color={paymentColors[selectedOrder.payment_status || "pending"] ?? paymentColors.pending}
                  />
                  <div className="flex flex-col gap-1 pt-1">
                    {selectedOrder.payment_status === "paid" ? (
                      <button
                        onClick={() => updateField(selectedOrder.id, { payment_status: "pending", status: "awaiting_payment" })}
                        className="text-[11px] text-amber-700 hover:text-amber-900 font-medium text-left flex items-center gap-1"
                      >
                        <XCircle size={11} /> Ödeme Yapılmadı İşaretle
                      </button>
                    ) : (
                      <button
                        onClick={() => markPaymentPaid(selectedOrder.id)}
                        className="text-[11px] text-green-700 hover:text-green-900 font-medium text-left flex items-center gap-1"
                      >
                        <CheckCircle size={11} /> Ödendi İşaretle
                      </button>
                    )}
                    <button
                      onClick={() => updateField(selectedOrder.id, { payment_status: "failed" })}
                      className="text-[11px] text-red-600 hover:text-red-800 font-medium text-left flex items-center gap-1"
                    >
                      <XCircle size={11} /> Başarısız İşaretle
                    </button>
                  </div>
                </div>

                {/* Sevkiyat */}
                <div className="border rounded-xl p-3 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Sevkiyat</p>
                  <StatusBadge
                    label={shipmentLabels[selectedOrder.shipment_status || "waiting"] ?? (selectedOrder.shipment_status || "waiting")}
                    color={shipmentColors[selectedOrder.shipment_status || "waiting"] ?? shipmentColors.waiting}
                  />
                  {selectedOrder.kargonomi_tracking_code && (
                    <div className="flex items-center gap-1">
                      <code className="text-[10px] font-mono text-purple-700">{selectedOrder.kargonomi_tracking_code}</code>
                      <button onClick={() => navigator.clipboard.writeText(selectedOrder.kargonomi_tracking_code!)} className="text-purple-400 hover:text-purple-700">
                        <Copy size={10} />
                      </button>
                    </div>
                  )}
                  <div className="flex flex-col gap-1 pt-1">
                    {!selectedOrder.kargonomi_tracking_code && (
                      <button
                        onClick={() => { setIsDetailsOpen(false); openShipDialog(selectedOrder); }}
                        className="text-[11px] text-purple-700 hover:text-purple-900 font-medium text-left flex items-center gap-1"
                      >
                        <Send size={11} /> Kargoya Ver
                      </button>
                    )}
                    <button
                      onClick={() => updateField(selectedOrder.id, { shipment_status: "delivered" })}
                      className="text-[11px] text-green-700 hover:text-green-900 font-medium text-left flex items-center gap-1"
                    >
                      <CheckCircle size={11} /> Teslim Edildi
                    </button>
                  </div>
                </div>

                {/* Fatura */}
                <div className="border rounded-xl p-3 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Fatura</p>
                  <StatusBadge
                    label={invoiceLabels[selectedOrder.invoice_status || "pending"] ?? (selectedOrder.invoice_status || "pending")}
                    color={invoiceColors[selectedOrder.invoice_status || "pending"] ?? invoiceColors.pending}
                  />
                  <div className="flex flex-col gap-1 pt-1">
                    <button
                      onClick={() => updateField(selectedOrder.id, { invoice_status: "invoiced" })}
                      className="text-[11px] text-teal-700 hover:text-teal-900 font-medium text-left flex items-center gap-1"
                    >
                      <FileText size={11} /> Faturalandı İşaretle
                    </button>
                    <button
                      onClick={() => updateField(selectedOrder.id, { invoice_status: "pending" })}
                      className="text-[11px] text-slate-500 hover:text-slate-700 font-medium text-left flex items-center gap-1"
                    >
                      <Clock size={11} /> Bekliyor'a Al
                    </button>
                  </div>
                </div>
              </div>

              {/* iyzico İade Paneli */}
              {selectedOrder.payment_method === "iyzico" && selectedOrder.iyzico_payment_id && (
                <div className={`border rounded-xl p-4 space-y-3 ${
                  selectedOrder.refund_status === "full"
                    ? "border-slate-200 bg-slate-50"
                    : "border-blue-100 bg-blue-50/40"
                }`}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
                      <Landmark size={12} /> iyzico İade
                    </p>
                    {selectedOrder.refund_status && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        selectedOrder.refund_status === "full"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}>
                        {selectedOrder.refund_status === "full" ? "Tam İade" : "Kısmi İade"}
                        {selectedOrder.refunded_amount ? ` — ₺${Number(selectedOrder.refunded_amount).toFixed(2)}` : ""}
                      </span>
                    )}
                  </div>

                  {selectedOrder.refund_status !== "full" ? (
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] text-slate-500 font-medium">
                          İade Tutarı (maks. ₺{(Number(selectedOrder.total_amount) - Number(selectedOrder.refunded_amount ?? 0)).toFixed(2)})
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={Number(selectedOrder.total_amount) - Number(selectedOrder.refunded_amount ?? 0)}
                          value={refundAmount}
                          onChange={e => setRefundAmount(e.target.value)}
                          className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </div>
                      <Button
                        size="sm"
                        className="h-9 gap-1.5 bg-blue-600 hover:bg-blue-700 shrink-0"
                        disabled={refundLoading}
                        onClick={() => handleRefund(selectedOrder.id)}
                      >
                        {refundLoading
                          ? <Loader2 size={13} className="animate-spin" />
                          : <Landmark size={13} />}
                        İade Et
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">Bu sipariş tam olarak iade edilmiştir.</p>
                  )}

                  {refundResult && (
                    <p className={`text-xs font-medium flex items-center gap-1 ${refundResult.ok ? "text-green-700" : "text-red-600"}`}>
                      {refundResult.ok
                        ? <CheckCircle size={12} />
                        : <AlertCircle size={12} />}
                      {refundResult.msg}
                    </p>
                  )}
                </div>
              )}

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
                                <span>{edit?.title || item.products?.title || <span className="text-muted-foreground italic">—</span>}</span>
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
                  <div className="bg-muted/50 p-3 flex justify-between items-center border-t">
                    <span className="text-sm font-bold">Genel Toplam</span>
                    <span className="text-lg font-black text-blue-600">₺{selectedOrder.total_amount.toFixed(2)}</span>
                  </div>
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

            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Yeni Sipariş Dialog ──────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setCreateError(""); } }}>
        <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
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
                  placeholder="İsim veya e-posta ile ara…"
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
                        <span className="text-xs text-muted-foreground">{c.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedCustomer && (
                <div className="bg-slate-50 border rounded-lg px-3 py-2 text-xs text-muted-foreground flex gap-4">
                  <span className="flex items-center gap-1"><Mail size={11} /> {selectedCustomer.email}</span>
                  {selectedCustomer.phone && <span className="flex items-center gap-1"><Phone size={11} /> {selectedCustomer.phone}</span>}
                </div>
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
                {newItems.map((item, idx) => (
                  <div key={idx} className="border rounded-lg p-3 space-y-2 bg-slate-50/50">
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-start">
                      {/* SKU */}
                      <div className="space-y-1">
                        <div className="relative">
                          <Input
                            className="font-mono text-xs h-8"
                            placeholder="Ürün kodu (SKU)…"
                            value={item.sku}
                            onChange={(e) => {
                              const val = e.target.value;
                              setNewItems(prev => prev.map((it, i) => i === idx ? { ...it, sku: val, skuError: "", productId: "", variantId: "", title: "", variantName: "" } : it));
                              searchSkuDropdown(idx, val);
                            }}
                            onBlur={() => setTimeout(() => setSkuDropdown(null), 200)}
                            onKeyDown={(e) => { if (e.key === "Escape") setSkuDropdown(null); }}
                          />
                          {item.skuLoading && <Loader2 size={11} className="animate-spin absolute right-2 top-1/2 -translate-y-1/2 text-blue-400" />}
                          {/* Dropdown */}
                          {skuDropdown?.idx === idx && skuDropdown.results.length > 0 && (
                            <div className="absolute z-50 mt-1 w-full min-w-[260px] bg-white border rounded-lg shadow-lg overflow-hidden">
                              {skuDropdown.results.map((v: any) => {
                                const opt = v.variant_options;
                                const vName = opt?.value && opt?.variant_groups?.name ? `${opt.variant_groups.name}: ${opt.value}` : (opt?.value ?? "");
                                return (
                                  <button
                                    key={v.id}
                                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 border-b last:border-0 flex flex-col"
                                    onMouseDown={() => selectSkuFromDropdown(idx, v)}
                                  >
                                    <span className="font-mono font-bold text-blue-700">{v.sku}</span>
                                    <span className="text-slate-500 truncate">{v.products?.title}{vName ? ` · ${vName}` : ""} — ₺{v.price}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        {item.skuError && <p className="text-[10px] text-red-500">{item.skuError}</p>}
                        {item.title && <p className="text-[11px] text-slate-600 font-medium truncate">{item.title}{item.variantName ? ` · ${item.variantName}` : ""}</p>}
                      </div>
                      {/* Adet */}
                      <div className="w-16">
                        <Input
                          type="number" min={1} className="h-8 text-xs text-center"
                          value={item.quantity}
                          onChange={(e) => setNewItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Math.max(1, Number(e.target.value)) } : it))}
                        />
                      </div>
                      {/* Fiyat */}
                      <div className="w-24">
                        <Input
                          type="number" min={0} step={0.01} className="h-8 text-xs"
                          placeholder="₺ Fiyat"
                          value={item.unitPrice || ""}
                          onChange={(e) => setNewItems(prev => prev.map((it, i) => i === idx ? { ...it, unitPrice: Number(e.target.value) } : it))}
                        />
                      </div>
                      {/* Sil */}
                      {newItems.length > 1 && (
                        <button
                          onClick={() => setNewItems(prev => prev.filter((_, i) => i !== idx))}
                          className="text-red-400 hover:text-red-600 mt-1"
                        >
                          <XCircle size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setNewItems(prev => [...prev, { sku: "", productId: "", variantId: "", variantName: "", title: "", quantity: 1, unitPrice: 0, skuError: "", skuLoading: false }])}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
              >
                + Ürün ekle
              </button>

              {/* Özet */}
              {newItems.some(i => i.unitPrice > 0) && (() => {
                const subtotal = newItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
                const ship = subtotal >= 500 ? 0 : 29.90;
                return (
                  <div className="bg-slate-100 rounded-lg px-3 py-2 text-xs space-y-1">
                    <div className="flex justify-between text-slate-500"><span>Ara toplam</span><span>₺{subtotal.toFixed(2)}</span></div>
                    <div className="flex justify-between text-slate-500"><span>Kargo</span><span>{ship === 0 ? "Ücretsiz" : `₺${ship.toFixed(2)}`}</span></div>
                    <div className="flex justify-between font-bold text-slate-800 border-t pt-1"><span>Toplam</span><span>₺{(subtotal + ship).toFixed(2)}</span></div>
                  </div>
                );
              })()}
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
