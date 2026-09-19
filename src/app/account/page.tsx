"use client";

import { useEffect, useState, Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  User,
  Package,
  MapPin,
  ShieldCheck,
  LogOut,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Clock,
  Box,
  CreditCard,
  Edit2,
  Link2,
  Copy,
  TrendingUp,
  Banknote,
  Ticket,
  Percent,
  DollarSign,
  Truck,
  AlertTriangle,
  Loader2,
  MessageSquare,
  Send,
  RotateCcw,
} from "lucide-react";
import { useCartStore } from "@/store/useCartStore";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { GeoSelect } from "@/components/ui/geo-select";
import { CITIES, DISTRICTS } from "@/lib/turkey-geo";
import { cn } from "@/lib/utils";
import OrderMessagesModal from "@/components/account/OrderMessagesModal";

type TabType = "orders" | "addresses" | "profile" | "security" | "affiliate" | "coupons" | "messages";
// Akordiyon bölüm anahtarları (tek akordiyon; üst menü yok)
type SectionKey = "orders" | "coupons" | "affiliate" | "profil" | "adres";

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center animate-pulse text-olive-600 font-bold">Yükleniyor...</div>}>
      <AccountPageInner />
    </Suspense>
  );
}

/** 10 haneli telefon numarasını "5XX XXX XX XX" formatında gösterir */
function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length === 0) return "";
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  if (d.length <= 8) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8, 10)}`;
}

// Sipariş "Detaylar" paneli yardımcıları
function parseShippingAddr(raw: any): { name?: string; phone?: string; address?: string; district?: string; city?: string } | null {
  if (!raw) return null;
  try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; }
}
function payMethodLabel(m?: string): string { return m === "bank_transfer" ? "Havale / EFT" : "Kart (iyzico)"; }
function payStatusLabel(s?: string): string { return s === "paid" ? "Ödendi" : s === "failed" ? "Başarısız" : "Bekliyor"; }

// Admin ile birebir aynı 3 boyutlu durum (Ödeme / Sevkiyat / Fatura) rozetleri.
// Müşteri sipariş satırında da güncel durumu gösterir (legacy `status` yerine
// gerçek payment_status/shipment_status/invoice_status alanlarını okur).
const PAY_LABEL: Record<string, string> = { paid: "Ödendi", failed: "Başarısız", pending: "Bekliyor" };
const PAY_COLOR: Record<string, string> = { paid: "bg-green-50 text-green-700", failed: "bg-red-50 text-red-600", pending: "bg-amber-50 text-amber-700" };
const SHIP_LABEL: Record<string, string> = { waiting: "Bekliyor", preparing: "Hazırlanıyor", shipped: "Kargoya Verildi", delivered: "Teslim Edildi", cancelled: "İptal Edildi" };
const SHIP_COLOR: Record<string, string> = { waiting: "bg-slate-100 text-slate-500", preparing: "bg-blue-50 text-blue-700", shipped: "bg-purple-50 text-purple-700", delivered: "bg-green-50 text-green-700", cancelled: "bg-red-50 text-red-600" };
const INV_LABEL: Record<string, string> = { pending: "Bekliyor", invoiced: "Faturalandı" };
const INV_COLOR: Record<string, string> = { pending: "bg-slate-100 text-slate-500", invoiced: "bg-teal-50 text-teal-700" };

function OrderStatusChips({ order }: { order: any }) {
  const pay = order.payment_status || "pending";
  const ship = order.shipment_status || "waiting";
  const inv = order.invoice_status || "pending";
  const Chip = ({ title, label, color }: { title: string; label: string; color: string }) => (
    <div className="flex flex-col items-start gap-1">
      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{title}</span>
      <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold whitespace-nowrap", color)}>{label}</span>
    </div>
  );
  return (
    <div className="flex items-start gap-3 sm:gap-4 flex-wrap">
      <Chip title="Ödeme" label={PAY_LABEL[pay] ?? pay} color={PAY_COLOR[pay] ?? PAY_COLOR.pending} />
      <Chip title="Sevkiyat" label={SHIP_LABEL[ship] ?? ship} color={SHIP_COLOR[ship] ?? SHIP_COLOR.waiting} />
      <Chip title="Fatura" label={INV_LABEL[inv] ?? inv} color={INV_COLOR[inv] ?? INV_COLOR.pending} />
    </div>
  );
}

// Hesabım akordiyon bölümü. Her bölüm kendine ait canlı bir renkle ayrışır:
// başlık tam renkli bir blok, üzerinde beyaz çizgi ikon + beyaz kalın başlık
// (mobilde yüksek kontrast → kolay okunur). Kapalı içerik DOM'da kalır (hidden),
// böylece form durumları korunur.
function AccSection({ title, isOpen, onToggle, children, className, color, icon: Icon, dark = false }: {
  title: string; isOpen: boolean; onToggle: () => void; children: React.ReactNode; className?: string;
  color: string; icon: React.ComponentType<{ size?: number; className?: string }>;
  // Pastel/açık renkli başlıklarda metin okunaklı kalsın diye koyu metin modu.
  dark?: boolean;
}) {
  const fg = dark ? "text-slate-800" : "text-white";
  return (
    <div className={cn("rounded-2xl overflow-hidden shadow-sm", className)}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left transition-[filter] hover:brightness-105"
        style={{ backgroundColor: color }}
      >
        <span className="flex items-center gap-3 min-w-0">
          <Icon size={22} className={cn("shrink-0", fg)} />
          <span className={cn("text-base md:text-lg font-black tracking-tight truncate", fg)} style={dark ? undefined : { textShadow: "0 1px 2px rgba(0,0,0,0.18)" }}>{title}</span>
        </span>
        <ChevronDown size={20} className={cn("transition-transform shrink-0", dark ? "text-slate-500" : "text-white/90", isOpen && "rotate-180")} />
      </button>
      <div hidden={!isOpen} className="bg-white px-5 pb-6 pt-5 space-y-6">
        {children}
      </div>
    </div>
  );
}

// Bölüm renkleri — birbirinden ayrık, beyaz metinle okunaklı (koyu/doygun tonlar).
const ACC_COLORS = {
  orders:    "#4B7D1E", // zeytin (marka)
  coupons:   "#B45309", // amber
  affiliate: "#C4B5FD", // yumuşak pastel mor (koyu metinle okunur)
  profil:    "#0E7490", // teal
  adres:     "#334155", // koyu gri (eski güvenlik rengi)
} as const;

function AccountPageInner() {
  const router = useRouter();
  const { addItem, clearCart } = useCartStore();
  const searchParams = useSearchParams();

  // Otomatik iptal olmuş (ödeme yarıda kalmış) siparişi sepete geri yükle → /sepet.
  // Eski siparişe DOKUNMAZ; checkout yeni sipariş oluşturur (taze stok/fiyat/kupon).
  function reactivateOrder(order: any) {
    const items = order.order_items || [];
    if (!items.length) return;
    clearCart();
    for (const it of items) {
      addItem({
        id: it.variant_id ? `var_${it.variant_id}` : `prod_${it.product_id}`,
        product_id: it.product_id,
        variant_id: it.variant_id || undefined,
        title: it.products?.title || "Ürün",
        image: it.products?.images?.[0] || it.products?.image_url || "/placeholder.png",
        price: Number(it.unit_price) || 0,
        quantity: it.quantity || 1,
        stock: it.quantity || 1, // gerçek stok kontrolünü checkout/create yapar (oversell guard)
        variant_name: it.variant_name || undefined,
      });
    }
    router.push("/sepet");
  }

  // Tüm hesap sayfası tek akordiyon — üst menü kutusu yok. ?tab= eski linkleri
  // ilgili bölüme eşler.
  const rawTab = searchParams.get("tab") as TabType | null;
  const msgParam = searchParams.get("msg"); // e-postadaki "Yanıtla" → o siparişin mesaj modalını aç
  const returnTo = searchParams.get("returnTo"); // checkout'tan gelindiyse kaydettikten sonra dönülecek sayfa

  const initialSection: SectionKey = (() => {
    switch (rawTab) {
      case "coupons": return "coupons";
      case "affiliate": return "affiliate";
      case "profile": return "profil";
      case "addresses": return "adres";
      case "security": return "profil"; // Güvenlik artık Profil altında
      default: return "orders";
    }
  })();

  const [openSection, setOpenSection] = useState<SectionKey | null>(initialSection);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null); // sipariş "Detaylar"
  const [msgOrder, setMsgOrder] = useState<{ id: string; label: string; draft?: string } | null>(null); // açık mesaj modalı
  const [orderUnread, setOrderUnread] = useState<Record<string, number>>({}); // sipariş → okunmamış admin mesajı

  // Eski derin linkler (?tab=addresses/security) Profilim'e düşer; ilgili
  // alt bölüme yumuşak kaydır.
  useEffect(() => {
    if (rawTab === "addresses" || rawTab === "security") {
      const id = rawTab === "security" ? "hesap-guvenlik" : "hesap-adres";
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [reviewedOrderIds, setReviewedOrderIds] = useState<Set<string>>(new Set());
  const [addresses, setAddresses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Kupon state
  const [userCoupons, setUserCoupons] = useState<any[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(false);
  const [claimCode, setClaimCode] = useState("");
  const [claimLoading, setClaimLoading] = useState(false);
  const [showClaimInput, setShowClaimInput] = useState(false);

  // Affiliate state
  const [affiliate, setAffiliate] = useState<any>(null);
  const [affiliateConversions, setAffiliateConversions] = useState<any[]>([]);
  const [affiliatePending, setAffiliatePending] = useState(0);
  const [affiliateLedger, setAffiliateLedger] = useState<any[]>([]);
  const [affiliateLoading, setAffiliateLoading] = useState(false);
  const [affiliateApplying, setAffiliateApplying] = useState(false);
  const [affiliateCopied, setAffiliateCopied] = useState(false);
  const [appForm, setAppForm] = useState({
    platform: "",
    audience_size: "",
    content_type: "",
    profile_url: "",
  });

  // Address Modal State
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addressForm, setAddressForm] = useState({
    address_name: "",
    first_name: "",
    last_name: "",
    phone: "",
    city: "",
    district: "",
    address_detail: "",
    is_default_shipping: false,
    is_default_billing: false,
    is_corporate: false,
    company_name: "",
    tax_office: "",
    tax_number: "",
  });

  // Password State
  const [passwordForm, setPasswordForm] = useState({
    password: "",
    confirmPassword: "",
  });
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Messaging State
  const [messages, setMessages] = useState<any[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  // Review State
  const [reviewDialog, setReviewDialog] = useState<{ open: boolean; orderId: string; step: "form" | "thanks" } | null>(null);
  const [reviewRatings, setReviewRatings] = useState({ shipping: 0, quality: 0, communication: 0 });
  const [reviewHover, setReviewHover] = useState<{ cat: string; star: number } | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewImages, setReviewImages] = useState<File[]>([]);
  const [reviewPreviews, setReviewPreviews] = useState<string[]>([]);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  useEffect(() => {
    fetchUserData();
  }, []);

  // Checkout'tan adres eklemeye gelindiyse (returnTo) ve kayıtlı adres yoksa
  // formu prefill'li otomatik aç — kullanıcı doğrudan doldurmaya başlasın.
  useEffect(() => {
    if (!loading && returnTo && addresses.length === 0 && !showAddressForm) {
      openAddressForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, returnTo, addresses.length]);

  useEffect(() => {
    if (openSection === "affiliate" && !affiliate && !affiliateLoading) {
      fetchAffiliateData();
    }
    if (openSection === "coupons") {
      fetchUserCoupons();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSection]);

  // Sipariş başına okunmamış admin mesajı sayısı (Mesaj butonu rozeti)
  async function fetchOrderUnread(uid?: string) {
    const id = uid || user?.id;
    if (!id) return;
    const { data } = await (supabase as any)
      .from("messages").select("order_id").eq("user_id", id).eq("sender_role", "admin").eq("is_read", false);
    const map: Record<string, number> = {};
    for (const m of (data as any[]) || []) if (m.order_id) map[m.order_id] = (map[m.order_id] || 0) + 1;
    setOrderUnread(map);
  }

  async function fetchMessages() {
    if (!user) return;
    setMessagesLoading(true);
    const { data } = await supabase
      .from("messages" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    setMessages((data as any[]) || []);
    setMessagesLoading(false);
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;
    setSendingMessage(true);
    
    const { data, error } = await supabase.from("messages" as any).insert({
      user_id: user.id,
      content: newMessage.trim(),
      sender_role: "user"
    }).select().single();
    
    if (error) {
      alert("Mesaj gönderilemedi.");
    } else {
      setMessages([...messages, data as any]);
      setNewMessage("");
    }
    setSendingMessage(false);
  }

  function openReviewDialog(orderId: string) {
    setReviewDialog({ open: true, orderId, step: "form" });
    setReviewRatings({ shipping: 0, quality: 0, communication: 0 });
    setReviewHover(null);
    setReviewComment("");
    setReviewImages([]);
    setReviewPreviews([]);
  }

  function handleReviewImageAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const remaining = 3 - reviewImages.length;
    const added = files.slice(0, remaining);
    setReviewImages(prev => [...prev, ...added]);
    added.forEach(f => {
      const reader = new FileReader();
      reader.onload = ev => setReviewPreviews(prev => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(f);
    });
    e.target.value = "";
  }

  function removeReviewImage(idx: number) {
    setReviewImages(prev => prev.filter((_, i) => i !== idx));
    setReviewPreviews(prev => prev.filter((_, i) => i !== idx));
  }

  async function submitReview() {
    if (!reviewDialog || !user) return;
    if (!reviewRatings.shipping || !reviewRatings.quality || !reviewRatings.communication) {
      alert("Lütfen tüm konular için puan verin.");
      return;
    }
    setReviewSubmitting(true);
    try {
      // Görselleri yükle
      const imageUrls: string[] = [];
      for (const file of reviewImages) {
        const ext = file.name.split(".").pop();
        const path = `reviews/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { data: upload } = await supabase.storage
          .from("product-images")
          .upload(path, file, { upsert: true });
        if (upload) {
          const { data: { publicUrl } } = supabase.storage.from("product-images").getPublicUrl(path);
          imageUrls.push(publicUrl);
        }
      }
      const { error: reviewError } = await (supabase.from("order_reviews" as any).insert({
        order_id: reviewDialog.orderId,
        user_id: user.id,
        rating_shipping: reviewRatings.shipping,
        rating_quality: reviewRatings.quality,
        rating_communication: reviewRatings.communication,
        comment: reviewComment,
        images: imageUrls,
      }) as any);
      if (reviewError) throw reviewError;
      setReviewedOrderIds((prev) => new Set(prev).add(reviewDialog.orderId));
      setReviewDialog(prev => prev ? { ...prev, step: "thanks" } : null);
    } catch (e: unknown) {
      console.error(e);
      const code = (e as { code?: string })?.code;
      const msg =
        code === "23505"
          ? "Bu sipariş için zaten bir yorum yaptınız."
          : "Yorum gönderilemedi: " + (e instanceof Error ? e.message : "bilinmeyen hata");
      alert(msg);
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function fetchUserCoupons() {
    if (!user) return;
    setCouponsLoading(true);
    const { data } = await supabase
      .from("user_coupons")
      .select("*, coupons(*)")
      .eq("user_id", user.id)
      .order("added_at", { ascending: false });
    setUserCoupons(data || []);
    setCouponsLoading(false);
  }

  async function handleClaimCoupon(e: React.FormEvent) {
    e.preventDefault();
    if (!claimCode.trim()) return;
    setClaimLoading(true);
    const authHeaders = await getAuthHeaders();
    const res = await fetch("/api/coupons/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ code: claimCode.trim() }),
    });
    const data = await res.json();
    setClaimLoading(false);
    if (data.success) {
      setClaimCode("");
      setShowClaimInput(false);
      fetchUserCoupons();
    } else {
      alert(data.error || "Kod eklenemedi.");
    }
  }

  async function getAuthHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {};
  }

  async function fetchAffiliateData() {
    setAffiliateLoading(true);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/affiliate/stats", { headers });
    const data = await res.json();
    if (data.affiliate) {
      setAffiliate(data.affiliate);
      setAffiliateConversions(data.conversions || []);
      setAffiliatePending(data.pendingEarnings || 0);
      setAffiliateLedger(data.ledger || []);
    }
    setAffiliateLoading(false);
  }

  async function handleAffiliateApply(e: React.FormEvent) {
    e.preventDefault();
    setAffiliateApplying(true);
    const authHeaders = await getAuthHeaders();
    const res = await fetch("/api/affiliate/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ answers: appForm }),
    });
    const data = await res.json();
    setAffiliateApplying(false);
    if (data.affiliate) {
      setAffiliate(data.affiliate);
    } else {
      alert(data.error || "Başvuru sırasında hata oluştu.");
    }
  }

  function copyAffiliateCode(code: string) {
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    navigator.clipboard.writeText(`${siteUrl}?ref=${code}`).then(() => {
      setAffiliateCopied(true);
      setTimeout(() => setAffiliateCopied(false), 2000);
    });
  }

  async function fetchUserData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login?redirect=/account");
      return;
    }
    setUser(user);

    const [prof, ords, addrs, revs] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('orders').select('*, order_number, order_items(*, variant_name, products(title, image_url, images))').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('user_addresses').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      (supabase as any).from('order_reviews').select('order_id').eq('user_id', user.id),
    ]);

    setProfile(prof.data);
    setOrders(ords.data || []);
    setAddresses(addrs.data || []);
    setReviewedOrderIds(new Set(((revs.data as any[]) || []).map((r) => r.order_id)));
    setLoading(false);
    fetchOrderUnread(user.id);
    // E-postadan "Yanıtla" ile gelindiyse o siparişin mesaj modalını aç
    if (msgParam) {
      const o = (ords.data || []).find((x: any) => x.id === msgParam);
      if (o) setMsgOrder({ id: o.id, label: o.order_number ? `YH${o.order_number}` : `#${o.id.slice(0, 8)}` });
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from('profiles').update({
      first_name: profile.first_name,
      last_name: profile.last_name,
      phone: profile.phone,
    }).eq('id', user.id);
    
    if (error) alert("Hata: " + error.message);
    else alert("Profil başarıyla güncellendi.");
  }

  // Formu prefill ile aç: isim-soyad profilden gelir; İLK adreste varsayılan
  // sevkiyat + fatura otomatik işaretli (kullanıcı uğraşmasın).
  function openAddressForm() {
    const firstAddr = addresses.length === 0;
    const digits = (profile?.phone ? String(profile.phone).replace(/\D/g, "") : "");
    setAddressForm({
      address_name: "",
      first_name: profile?.first_name || "",
      last_name: profile?.last_name || "",
      phone: digits.slice(-10),
      city: "",
      district: "",
      address_detail: "",
      is_default_shipping: firstAddr,
      is_default_billing: firstAddr,
      is_corporate: false,
      company_name: "",
      tax_office: "",
      tax_number: "",
    });
    setShowAddressForm(true);
  }

  async function handleAddAddress(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    if (!addressForm.city) { alert("Lütfen il seçiniz."); return; }
    if (!addressForm.district) { alert("Lütfen ilçe seçiniz."); return; }
    if (addressForm.phone.length !== 10) { alert("Telefon numarası 10 haneli olmalıdır."); return; }
    if (addressForm.is_corporate) {
      if (!addressForm.company_name.trim()) { alert("Lütfen şirket ünvanını girin."); return; }
      if (!addressForm.tax_office.trim()) { alert("Lütfen vergi dairesini girin."); return; }
      const vkn = addressForm.tax_number.replace(/\D/g, "");
      if (vkn.length !== 10 && vkn.length !== 11) { alert("Vergi numarası 10 (VKN) veya 11 (TCKN) haneli olmalıdır."); return; }
    }

    // Kurumsal değilse şirket/vergi alanlarını boşalt (tutarlılık için)
    const { error } = await supabase.from('user_addresses').insert({
      ...addressForm,
      company_name: addressForm.is_corporate ? addressForm.company_name.trim() : null,
      tax_office: addressForm.is_corporate ? addressForm.tax_office.trim() : null,
      tax_number: addressForm.is_corporate ? addressForm.tax_number.replace(/\D/g, "") : null,
      user_id: user.id
    });

    if (error) { alert("Hata: " + error.message); return; }

    // Checkout'tan gelindiyse: kaydedince ödeme sayfasına GERİ DÖN.
    if (returnTo) { router.push(returnTo); return; }

    setShowAddressForm(false);
    setAddressForm({
      address_name: "",
      first_name: "",
      last_name: "",
      phone: "",
      city: "",
      district: "",
      address_detail: "",
      is_default_shipping: false,
      is_default_billing: false,
      is_corporate: false,
      company_name: "",
      tax_office: "",
      tax_number: "",
    });
    fetchUserData();
  }

  async function handleDeleteAddress(id: string) {
    if (!confirm("Bu adresi silmek istediğinize emin misiniz?")) return;
    await supabase.from('user_addresses').delete().eq('id', id);
    fetchUserData();
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (passwordForm.password !== passwordForm.confirmPassword) {
      alert("Şifreler uyuşmuyor.");
      return;
    }
    if (passwordForm.password.length < 6) {
      alert("Şifre en az 6 karakter olmalıdır.");
      return;
    }
    
    setIsUpdatingPassword(true);
    const { error } = await supabase.auth.updateUser({
      password: passwordForm.password
    });
    setIsUpdatingPassword(false);
    
    if (error) alert("Hata: " + error.message);
    else {
      alert("Şifreniz başarıyla güncellendi.");
      setPasswordForm({ password: "", confirmPassword: "" });
    }
  }

  if (loading) {
     return (
       <div className="min-h-screen flex items-center justify-center">
         <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-olive-600"></div>
       </div>
     );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-black tracking-tighter text-olive-600">
            Yeri<span className="text-slate-900">Hisset</span>
          </Link>
          <div className="flex items-center gap-4">
             <span className="text-sm font-bold text-slate-500 hidden sm:block">
               Hoş geldin, {profile?.first_name || user?.email?.split('@')[0]}
             </span>
             <Button variant="ghost" size="icon" onClick={handleSignOut} title="Çıkış Yap">
               <LogOut size={20} className="text-slate-400 hover:text-red-500 transition-colors" />
             </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 md:py-12">
        {/* Tek akordiyon — üst menü kutusu yok, her bölüm katlanır */}
        <div className="max-w-3xl mx-auto flex flex-col gap-4">

            {/* ── Kuponlarım ── */}
            <AccSection title="Kuponlarım" icon={Ticket} color={ACC_COLORS.coupons} isOpen={openSection === "coupons"} onToggle={() => setOpenSection(openSection === "coupons" ? null : "coupons")} className="order-2">
                <p className="text-sm text-slate-500 -mt-1">Size tanımlı indirim kuponları burada görünür ve ödeme sırasında kullanılabilir.</p>

                {/* Yakında sona erecek uyarıları */}
                {(() => {
                  const soonExpiring = userCoupons.filter((uc) => {
                    const exp = uc.coupons?.expires_at;
                    if (!exp) return false;
                    const diff = Math.ceil((new Date(exp).getTime() - Date.now()) / 86400000);
                    return diff >= 0 && diff <= 7;
                  });
                  if (!soonExpiring.length) return null;
                  return (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                      <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-amber-800">Sona ermek üzere kuponunuz var!</p>
                        <p className="text-xs text-amber-600 mt-0.5">
                          {soonExpiring.map((uc) => uc.coupons?.name).join(", ")} — fırsatı kaçırmayın.
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {couponsLoading ? (
                  <div className="flex justify-center py-16"><Loader2 className="animate-spin text-olive-600" size={28} /></div>
                ) : userCoupons.length === 0 ? (
                  <Card className="border-none shadow-sm flex flex-col items-center justify-center py-16 gap-4 text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                      <Ticket className="text-slate-300" size={28} />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-slate-900">Henüz kuponunuz yok.</h4>
                      <p className="text-sm text-slate-400">Kampanya kodunuz varsa yukarıdan ekleyebilirsiniz.</p>
                    </div>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {userCoupons.map((uc) => {
                      const c = uc.coupons;
                      if (!c) return null;
                      const expired = c.expires_at && new Date(c.expires_at) < new Date();
                      const diffDays = c.expires_at ? Math.ceil((new Date(c.expires_at).getTime() - Date.now()) / 86400000) : null;
                      const soonExpiry = diffDays !== null && diffDays >= 0 && diffDays <= 7;
                      const used = uc.use_count >= c.per_user_limit;
                      return (
                        <div
                          key={uc.id}
                          className={cn(
                            "rounded-2xl border-2 overflow-hidden transition-all",
                            expired || used ? "opacity-50 grayscale" : soonExpiry ? "border-amber-300 bg-amber-50/30" : "border-slate-200 bg-white hover:border-olive-200 hover:shadow-sm"
                          )}
                        >
                          {/* Üst renk bandı */}
                          <div className={cn(
                            "px-5 py-3 flex items-center justify-between",
                            c.type === "percentage" && "bg-olive-600",
                            c.type === "fixed" && "bg-green-600",
                            c.type === "free_shipping" && "bg-orange-500",
                            (expired || used) && "bg-slate-400"
                          )}>
                            <div className="flex items-center gap-2 text-white">
                              {c.type === "percentage" && <Percent size={14} />}
                              {c.type === "fixed" && <DollarSign size={14} />}
                              {c.type === "free_shipping" && <Truck size={14} />}
                              <span className="text-sm font-black">
                                {c.type === "percentage" ? `%${c.amount} İndirim` : c.type === "fixed" ? `₺${c.amount} İndirim` : "Ücretsiz Kargo"}
                              </span>
                            </div>
                            {used ? (
                              <span className="text-xs font-bold text-white/80 bg-white/20 px-2 py-0.5 rounded-full">Kullanıldı</span>
                            ) : expired ? (
                              <span className="text-xs font-bold text-white/80 bg-white/20 px-2 py-0.5 rounded-full">Süresi Doldu</span>
                            ) : soonExpiry ? (
                              <span className="text-xs font-bold text-amber-800 bg-amber-200 px-2 py-0.5 rounded-full">⚠ {diffDays} gün</span>
                            ) : null}
                          </div>

                          {/* İçerik */}
                          <div className="px-5 py-4 space-y-3">
                            <div>
                              <p className="font-black text-slate-900">{c.name}</p>
                              {c.description && <p className="text-xs text-slate-500 mt-0.5">{c.description}</p>}
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-black text-olive-700 bg-olive-50 px-3 py-1 rounded-lg text-sm tracking-widest border border-olive-100">
                                {c.code}
                              </span>
                              {c.expires_at && !expired && (
                                <span className="text-xs text-slate-400">
                                  {new Date(c.expires_at).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" })} tarihine kadar
                                </span>
                              )}
                              {!c.expires_at && <span className="text-xs text-slate-400">Süresiz</span>}
                            </div>
                            {c.min_order_amount > 0 && (
                              <p className="text-[11px] text-slate-400">Min. ₺{c.min_order_amount} sipariş tutarında geçerli</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
            </AccSection>

            <AccSection title="Siparişlerim" icon={Package} color={ACC_COLORS.orders} isOpen={openSection === "orders"} onToggle={() => setOpenSection(openSection === "orders" ? null : "orders")} className="order-1">
                <div className="flex items-center justify-end -mt-1">
                   <Badge variant="secondary" className="bg-white border text-slate-500 font-bold px-3 py-1">
                     Toplam {orders.length} Sipariş
                   </Badge>
                </div>

                {orders.length === 0 ? (
                  <Card className="border-none shadow-sm flex flex-col items-center justify-center py-20 gap-4 text-center">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center">
                       <Box className="text-slate-300" size={32} />
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-bold text-slate-900">Henüz siparişiniz yok.</h4>
                      <p className="text-sm text-slate-400">Harika ürünlerimizi incelemeye ne dersiniz?</p>
                    </div>
                    <Link href="/" className={cn(buttonVariants({ variant: "default" }), "bg-olive-600 font-bold px-8 mt-2")}>
                      Alışverişe Başla
                    </Link>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {orders.map((order) => (
                      <Card key={order.id} className="border-none shadow-sm overflow-hidden hover:shadow-md transition-all group">
                        <div className="bg-slate-50/50 p-4 border-b flex flex-wrap items-center justify-between gap-4">
                           <div className="flex gap-6">
                              <div>
                                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">SİPARİŞ TARİHİ</p>
                                <p className="text-sm font-bold text-slate-900">{new Date(order.created_at).toLocaleDateString('tr-TR')}</p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">TOPLAM TUTAR</p>
                                <p className="text-sm font-black text-olive-600">₺{order.total_amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
                              </div>
                              <div className="hidden md:block">
                                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">SİPARİŞ NO</p>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-bold text-olive-600">
                                    {order.order_number ? `YH${order.order_number}` : `#${order.id.slice(0,8)}`}
                                  </p>
                                  {reviewedOrderIds.has(order.id) ? (
                                    <span className="text-[10px] font-bold text-green-600 border border-green-200 bg-green-50 rounded-full px-2 py-0.5">
                                      ✓ Yorumlandı
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => openReviewDialog(order.id)}
                                      className="text-[10px] font-bold text-olive-600 hover:text-olive-800 border border-olive-200 hover:border-olive-400 bg-olive-50 hover:bg-olive-100 rounded-full px-2 py-0.5 transition-colors"
                                    >
                                      ⭐ Yorum Ekle
                                    </button>
                                  )}
                                </div>
                              </div>
                           </div>
                           <div className="flex items-center gap-3 flex-wrap">
                              <OrderStatusChips order={order} />
                              {order.status === 'cancelled' && order.auto_expired && (order.order_items?.length > 0) && (
                                <Button
                                  onClick={() => reactivateOrder(order)}
                                  size="sm"
                                  className="bg-olive-600 hover:bg-olive-700 text-white font-bold text-xs rounded-xl gap-1.5 h-9"
                                >
                                  <RotateCcw size={14} /> Siparişi Tekrar Oluştur
                                </Button>
                              )}
                              <Button
                                variant="outline" size="sm"
                                onClick={() => setMsgOrder({ id: order.id, label: order.order_number ? `YH${order.order_number}` : `#${order.id.slice(0,8)}` })}
                                className="relative font-bold text-xs gap-1.5 rounded-xl border-olive-200 text-olive-700 hover:bg-olive-50 h-9"
                              >
                                <MessageSquare size={14} /> Mesaj
                                {orderUnread[order.id] > 0 && (
                                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">{orderUnread[order.id]}</span>
                                )}
                              </Button>
                              <Button
                                variant="outline" size="sm"
                                onClick={() => {
                                  const label = order.order_number ? `YH${order.order_number}` : `#${order.id.slice(0,8)}`;
                                  setMsgOrder({ id: order.id, label, draft: `İade / değişim talebim var (Sipariş ${label}).\nÜrün(ler): \nSebep: \nİade mi değişim mi olacağını sizinle görüşerek belirlemek istiyorum.` });
                                }}
                                className="font-bold text-xs gap-1.5 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 h-9"
                              >
                                <RotateCcw size={14} /> İade / Değişim
                              </Button>
                              <Button
                                variant="ghost" size="sm"
                                onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                                className="font-bold text-xs gap-1"
                              >
                                Detaylar
                                <ChevronDown size={14} className={cn("transition-transform", expandedOrder === order.id && "rotate-180")} />
                              </Button>
                           </div>
                        </div>
                        <CardContent className="p-4 md:p-6">
                           <div className="flex flex-col gap-4">
                              {order.order_items?.map((item: any, idx: number) => (
                                <div key={idx} className="flex gap-4 items-center">
                                   <div className="w-16 h-16 bg-slate-100 rounded-xl overflow-hidden shrink-0">
                                      <Image
                                        src={item.products?.images?.[0] || item.products?.image_url || "/placeholder.png"}
                                        alt={item.products?.title || "Ürün"}
                                        width={64}
                                        height={64}
                                        className="w-full h-full object-cover"
                                      />
                                   </div>
                                   <div className="flex-1">
                                      <h4 className="text-sm font-bold text-slate-900">{item.products?.title}</h4>
                                      {item.variant_name && (
                                        <span className="inline-block text-[11px] text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 mt-0.5">
                                          {item.variant_name}
                                        </span>
                                      )}
                                      <p className="text-xs text-slate-400 mt-1">{item.quantity} Adet x ₺{item.unit_price.toLocaleString('tr-TR')}</p>
                                   </div>
                                </div>
                              ))}
                           </div>

                           {expandedOrder === order.id && (() => {
                             const addr = parseShippingAddr(order.shipping_address);
                             const itemsTotal = (order.order_items || []).reduce((s: number, i: any) => s + (Number(i.unit_price) * Number(i.quantity)), 0);
                             const discount = Number(order.coupon_discount || 0);
                             const shipping = Math.max(0, Number(order.total_amount) - itemsTotal + discount);
                             return (
                               <div className="mt-5 pt-5 border-t border-slate-100 grid sm:grid-cols-2 gap-5 text-sm animate-in fade-in slide-in-from-top-1">
                                 {/* Teslimat */}
                                 <div>
                                   <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Teslimat Adresi</p>
                                   {addr ? (
                                     <div className="text-slate-600 leading-relaxed">
                                       {addr.name && <p className="font-bold text-slate-800">{addr.name}</p>}
                                       {addr.address && <p>{addr.address}</p>}
                                       {(addr.district || addr.city) && <p>{[addr.district, addr.city].filter(Boolean).join(" / ")}</p>}
                                       {addr.phone && <p className="text-slate-400">{addr.phone}</p>}
                                     </div>
                                   ) : <p className="text-slate-400">—</p>}
                                 </div>
                                 {/* Ödeme & Kargo */}
                                 <div className="space-y-3">
                                   <div>
                                     <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Ödeme</p>
                                     <p className="text-slate-700">
                                       {payMethodLabel(order.payment_method)} · <span className={cn("font-bold", order.payment_status === "paid" ? "text-green-600" : order.payment_status === "failed" ? "text-red-500" : "text-amber-600")}>{payStatusLabel(order.payment_status)}</span>
                                     </p>
                                   </div>
                                   {order.kargonomi_tracking_code && (
                                     <div>
                                       <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Kargo Takip No</p>
                                       <p className="font-mono font-bold text-slate-700">{order.kargonomi_tracking_code}</p>
                                     </div>
                                   )}
                                 </div>
                                 {/* Tutar dökümü */}
                                 <div className="sm:col-span-2 rounded-xl bg-slate-50 p-4 space-y-1.5">
                                   <div className="flex justify-between"><span className="text-slate-500">Ürünler</span><span className="font-bold text-slate-800">₺{itemsTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</span></div>
                                   {discount > 0 && <div className="flex justify-between text-green-600"><span>İndirim</span><span className="font-bold">-₺{discount.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</span></div>}
                                   <div className="flex justify-between"><span className="text-slate-500">Kargo</span><span className="font-bold text-slate-800">{shipping > 0 ? `₺${shipping.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}` : "Ücretsiz"}</span></div>
                                   <div className="flex justify-between pt-1.5 border-t border-slate-200"><span className="font-black text-slate-900">Toplam</span><span className="font-black text-olive-600">₺{Number(order.total_amount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</span></div>
                                 </div>
                               </div>
                             );
                           })()}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
            </AccSection>

              <AccSection title="Profil Bilgilerim" icon={User} color={ACC_COLORS.profil} isOpen={openSection === "profil"} onToggle={() => setOpenSection(openSection === "profil" ? null : "profil")} className="order-4">
                <Card className="border-none shadow-sm overflow-hidden">
                   <div className="bg-slate-50 p-6 border-b">
                     <p className="text-sm font-medium text-slate-500 italic">Kişisel bilgilerinizi buradan güncelleyerek deneyiminizi özelleştirebilirsiniz.</p>
                   </div>
                   <CardContent className="p-8">
                      <form onSubmit={handleUpdateProfile} className="space-y-6">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-2">
                               <label className="text-xs font-bold uppercase text-slate-500 px-1">E-Posta Adresi</label>
                               <Input disabled value={user?.email} className="h-12 bg-slate-50 border-slate-100 text-slate-400 font-bold" />
                               <p className="text-[10px] text-slate-400 mt-1 pl-1">E-posta adresi güvenliğiniz nedeniyle değiştirilemez.</p>
                            </div>
                            <div className="space-y-2">
                               <label className="text-xs font-bold uppercase text-slate-500 px-1">Telefon</label>
                               <Input
                                 type="tel"
                                 inputMode="numeric"
                                 value={formatPhone(profile?.phone || "")}
                                 onChange={e => {
                                   const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                                   if (digits.length > 0 && digits[0] !== "5") return;
                                   setProfile({...profile, phone: digits});
                                 }}
                                 placeholder="5XX XXX XX XX"
                                 className="h-12 tracking-wide"
                               />
                            </div>
                            <div className="space-y-2">
                               <label className="text-xs font-bold uppercase text-slate-500 px-1">Ad</label>
                               <Input value={profile?.first_name || ""} onChange={e => setProfile({...profile, first_name: e.target.value})} placeholder="Adınız" className="h-12 font-bold" />
                            </div>
                            <div className="space-y-2">
                               <label className="text-xs font-bold uppercase text-slate-500 px-1">Soyad</label>
                               <Input value={profile?.last_name || ""} onChange={e => setProfile({...profile, last_name: e.target.value})} placeholder="Soyadınız" className="h-12 font-bold" />
                            </div>
                         </div>
                         <div className="flex justify-end pt-4">
                            <Button type="submit" className="bg-olive-600 px-12 h-14 rounded-2xl font-black shadow-lg shadow-olive-100 tracking-tighter uppercase transition-transform active:scale-95">DEĞİŞİKLİKLERİ KAYDET</Button>
                         </div>
                      </form>
                   </CardContent>
                </Card>

                {/* Güvenlik Ayarları — Profil altına taşındı (ayrı menü kaldırıldı) */}
                <div id="hesap-guvenlik" className="scroll-mt-24 pt-4 mt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2 mb-4 mt-4">
                    <ShieldCheck size={18} className="text-slate-700" />
                    <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Güvenlik Ayarları</h3>
                  </div>
                  <Card className="border-none shadow-sm">
                     <CardContent className="p-8 space-y-8">
                        <div className="flex items-center gap-6 p-6 bg-olive-50 rounded-3xl border-2 border-olive-100 border-dashed">
                           <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-olive-600 shadow-sm">
                              <ShieldCheck size={32} />
                           </div>
                           <div className="flex-1">
                              <h4 className="font-black text-slate-900 uppercase tracking-tight">Güvenli Şifre Yenileme</h4>
                              <p className="text-sm text-slate-500 leading-relaxed font-medium">Hesap güvenliğiniz için şifrenizi belirli aralıklarla güncellemenizi öneririz. Yeni şifreniz güçlü ve benzersiz olmalıdır.</p>
                           </div>
                        </div>

                        <div className="max-w-md space-y-6">
                           <form onSubmit={handleUpdatePassword} className="space-y-6">
                              <div className="space-y-2">
                                 <label className="text-xs font-bold uppercase text-slate-500 px-1">Yeni Şifre</label>
                                 <Input
                                  type="password"
                                  required
                                  value={passwordForm.password}
                                  onChange={e => setPasswordForm({...passwordForm, password: e.target.value})}
                                  placeholder="••••••••"
                                  className="h-12 font-bold"
                                 />
                              </div>
                              <div className="space-y-2">
                                 <label className="text-xs font-bold uppercase text-slate-500 px-1">Yeni Şifre (Tekrar)</label>
                                 <Input
                                  type="password"
                                  required
                                  value={passwordForm.confirmPassword}
                                  onChange={e => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                                  placeholder="••••••••"
                                  className="h-12 font-bold"
                                 />
                              </div>
                              <Button
                                type="submit"
                                disabled={isUpdatingPassword}
                                className="w-full h-14 rounded-2xl bg-slate-900 font-bold tracking-widest uppercase transition-all shadow-lg active:scale-95"
                              >
                                {isUpdatingPassword ? "GÜNCELLENİYOR..." : "ŞİFREYİ GÜNCELLE"}
                              </Button>
                           </form>
                        </div>
                     </CardContent>
                  </Card>
                </div>
              </AccSection>

              <div id="hesap-adres" className="scroll-mt-24 order-5">
              <AccSection title="Adres Bilgilerim" icon={MapPin} color={ACC_COLORS.adres} isOpen={openSection === "adres"} onToggle={() => setOpenSection(openSection === "adres" ? null : "adres")}>
                <div className="flex items-center justify-end">
                   {!showAddressForm && (
                     <Button
                      onClick={openAddressForm}
                      className="bg-olive-600 hover:bg-olive-700 font-bold rounded-2xl gap-2 h-12 shadow-lg shadow-olive-100"
                     >
                       <Plus size={18} /> Yeni Adres Ekle
                     </Button>
                   )}
                </div>

                {showAddressForm && (
                  <Card className="border-none shadow-xl ring-2 ring-olive-100 overflow-hidden animate-in slide-in-from-top duration-300">
                    <div className="bg-slate-50 p-6 border-b">
                      <h3 className="text-lg font-bold flex items-center gap-2">
                        <span className="w-1.5 h-6 bg-olive-600 rounded-full" />
                        Yeni Adres Bilgileri
                      </h3>
                    </div>
                    <CardContent className="p-6">
                      <form onSubmit={handleAddAddress} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-slate-500 px-1">Adres Başlığı (Örn: Ev, İş)</label>
                            <Input required value={addressForm.address_name} onChange={e => setAddressForm({...addressForm, address_name: e.target.value})} placeholder="Evim" className="h-12" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-slate-500 px-1">Telefon</label>
                            <Input
                              required
                              type="tel"
                              inputMode="numeric"
                              value={formatPhone(addressForm.phone)}
                              onChange={e => {
                                const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                                if (digits.length > 0 && digits[0] !== "5") return;
                                setAddressForm({...addressForm, phone: digits});
                              }}
                              placeholder="5XX XXX XX XX"
                              className="h-12 tracking-wide"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-slate-500 px-1">Alıcı Adı</label>
                            <Input required value={addressForm.first_name} onChange={e => setAddressForm({...addressForm, first_name: e.target.value})} placeholder="Ad" className="h-12" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-slate-500 px-1">Alıcı Soyadı</label>
                            <Input required value={addressForm.last_name} onChange={e => setAddressForm({...addressForm, last_name: e.target.value})} placeholder="Soyad" className="h-12" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-slate-500 px-1">Şehir (İl)</label>
                            <GeoSelect
                              options={CITIES}
                              value={addressForm.city}
                              onChange={city => setAddressForm({...addressForm, city, district: ""})}
                              placeholder="İl seçiniz..."
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-slate-500 px-1">İlçe</label>
                            <GeoSelect
                              options={addressForm.city ? (DISTRICTS[addressForm.city] ?? []) : []}
                              value={addressForm.district}
                              onChange={district => setAddressForm({...addressForm, district})}
                              placeholder={addressForm.city ? "İlçe seçiniz..." : "Önce il seçin"}
                              disabled={!addressForm.city}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase text-slate-500 px-1">Açık Adres</label>
                          <textarea 
                            required
                            className="flex min-h-[100px] w-full rounded-2xl border border-input bg-slate-50/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-olive-600 transition-all font-medium placeholder:text-slate-400 placeholder:font-normal"
                            value={addressForm.address_detail || ""}
                            onChange={e => setAddressForm({...addressForm, address_detail: e.target.value})}
                            placeholder="Mahalle, sokak, bina ve daire bilgileri..."
                          />
                        </div>

                        <div className="flex flex-col gap-4 p-4 bg-slate-50 rounded-2xl border-2 border-slate-100">
                           <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                id="is_corporate"
                                className="w-4 h-4 rounded text-olive-600"
                                checked={addressForm.is_corporate}
                                onChange={e => setAddressForm({...addressForm, is_corporate: e.target.checked})}
                              />
                              <label htmlFor="is_corporate" className="text-sm font-bold text-slate-700 select-none cursor-pointer">Kurumsal Fatura (şirket adına)</label>
                           </div>

                           {addressForm.is_corporate && (
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                               <div className="space-y-2 md:col-span-2">
                                 <label className="text-xs font-bold uppercase text-slate-500 px-1">Şirket Ünvanı</label>
                                 <Input value={addressForm.company_name} onChange={e => setAddressForm({...addressForm, company_name: e.target.value})} placeholder="Örn: Yeri Hisset Tic. Ltd. Şti." className="h-12" />
                               </div>
                               <div className="space-y-2">
                                 <label className="text-xs font-bold uppercase text-slate-500 px-1">Vergi Dairesi</label>
                                 <Input value={addressForm.tax_office} onChange={e => setAddressForm({...addressForm, tax_office: e.target.value})} placeholder="Örn: Kadıköy" className="h-12" />
                               </div>
                               <div className="space-y-2">
                                 <label className="text-xs font-bold uppercase text-slate-500 px-1">Vergi No (VKN / TCKN)</label>
                                 <Input
                                   inputMode="numeric"
                                   value={addressForm.tax_number}
                                   onChange={e => setAddressForm({...addressForm, tax_number: e.target.value.replace(/\D/g, "").slice(0, 11)})}
                                   placeholder="10 veya 11 haneli"
                                   className="h-12 tracking-wide font-mono"
                                 />
                               </div>
                             </div>
                           )}

                           <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                id="def_shipping"
                                className="w-4 h-4 rounded text-olive-600"
                                checked={addressForm.is_default_shipping}
                                onChange={e => setAddressForm({...addressForm, is_default_shipping: e.target.checked})}
                              />
                              <label htmlFor="def_shipping" className="text-sm font-bold text-slate-700 select-none cursor-pointer">Varsayılan Teslimat Adresi Olsun</label>
                           </div>
                           <div className="flex items-center gap-3">
                              <input 
                                type="checkbox" 
                                id="def_billing"
                                className="w-4 h-4 rounded text-olive-600"
                                checked={addressForm.is_default_billing}
                                onChange={e => setAddressForm({...addressForm, is_default_billing: e.target.checked})}
                              />
                              <label htmlFor="def_billing" className="text-sm font-bold text-slate-700 select-none cursor-pointer">Varsayılan Fatura Adresi Olsun</label>
                           </div>
                        </div>

                        <div className="flex gap-4 pt-2">
                          <Button type="button" variant="outline" className="flex-1 h-12 rounded-xl font-bold" onClick={() => setShowAddressForm(false)}>Vazgeç</Button>
                          <Button type="submit" className="flex-1 h-12 rounded-xl font-bold bg-olive-600 shadow-md">Adresi Kaydet</Button>
                        </div>
                      </form>
                    </CardContent>
                  </Card>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {addresses.map((addr) => (
                    <Card key={addr.id} className="border-none shadow-sm hover:shadow-md transition-all group relative">
                       <CardContent className="p-6 space-y-4">
                          <div className="flex justify-between items-start">
                             <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-olive-50 flex items-center justify-center text-olive-600">
                                   <MapPin size={16} />
                                </div>
                                <h4 className="font-bold text-slate-900">{addr.address_name}</h4>
                             </div>
                             <div className="flex gap-1">
                                <button className="p-2 text-slate-300 hover:text-red-500 transition-colors" onClick={() => handleDeleteAddress(addr.id)} title="Sil"><Trash2 size={16} /></button>
                             </div>
                          </div>
                          
                          <div className="text-sm space-y-1 text-slate-600 font-medium">
                             <p className="font-bold text-slate-900 border-b pb-2 mb-2">{addr.first_name} {addr.last_name}</p>
                             {addr.is_corporate && (
                               <div className="text-xs bg-slate-100 rounded-lg px-3 py-2 mb-2 space-y-0.5">
                                 <p className="font-bold text-slate-800">{addr.company_name}</p>
                                 <p className="text-slate-500">V.D.: {addr.tax_office} · VKN: <span className="font-mono">{addr.tax_number}</span></p>
                               </div>
                             )}
                             <p className="flex items-center gap-2 text-slate-400 italic text-xs"><Box size={12} /> {addr.phone}</p>
                             <p className="line-clamp-2 mt-2 leading-relaxed text-slate-500">{addr.address_detail}</p>
                             <p className="font-black text-slate-900 mt-2 uppercase tracking-tight">{addr.district} / {addr.city}</p>
                          </div>

                          <div className="flex flex-wrap gap-2 pt-2 border-t mt-4">
                             {addr.is_default_shipping && (
                               <Badge className="bg-olive-600 text-white border-none px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">Teslimat</Badge>
                             )}
                             {addr.is_default_billing && (
                               <Badge className="bg-slate-900 text-white border-none px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">Fatura</Badge>
                             )}
                             {addr.is_corporate && (
                               <Badge className="bg-blue-600 text-white border-none px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">Kurumsal</Badge>
                             )}
                          </div>
                       </CardContent>
                    </Card>
                  ))}
                  {addresses.length === 0 && !showAddressForm && (
                     <div 
                      onClick={openAddressForm}
                      className="border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center py-12 gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
                     >
                        <Plus className="text-slate-300" size={32} />
                        <span className="text-sm font-bold text-slate-400 tracking-tight">Kayıtlı adresiniz yok. Eklemek için tıklayın.</span>
                     </div>
                  )}
                </div>
              </AccSection>
              </div>

            <AccSection title="Satış Ortaklığı" icon={Link2} color={ACC_COLORS.affiliate} dark isOpen={openSection === "affiliate"} onToggle={() => setOpenSection(openSection === "affiliate" ? null : "affiliate")} className="order-3">
                <div className="flex items-center justify-end -mt-1">
                  <Link href="/affiliate" className={cn(buttonVariants({ variant: "ghost" }), "text-olive-600 font-bold text-sm gap-1")}>
                    Program Hakkında <ChevronRight size={14} />
                  </Link>
                </div>

                {affiliateLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-olive-600" />
                  </div>
                ) : !affiliate ? (
                  /* Başvuru Formu */
                  <Card className="border-none shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-r from-olive-600 to-olive-700 p-8 text-white">
                      <h3 className="text-2xl font-black mb-2">Satış Ortağı Ol, Kazan</h3>
                      <p className="text-olive-100 font-medium">
                        Her satıştan %10 komisyon kazan. Aşağıdaki soruları yanıtla ve hemen başla.
                      </p>
                    </div>
                    <CardContent className="p-8">
                      <form onSubmit={handleAffiliateApply} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-slate-500 px-1">Kullandığın Platform</label>
                            <select
                              required
                              value={appForm.platform}
                              onChange={(e) => setAppForm({ ...appForm, platform: e.target.value })}
                              className="flex w-full h-12 rounded-xl border border-input bg-slate-50/50 px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-olive-600"
                            >
                              <option value="">Seçin</option>
                              <option value="instagram">Instagram</option>
                              <option value="youtube">YouTube</option>
                              <option value="tiktok">TikTok</option>
                              <option value="blog">Blog / Web Sitesi</option>
                              <option value="other">Diğer</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-slate-500 px-1">Takipçi / Ziyaretçi Sayısı</label>
                            <Input
                              required
                              type="number"
                              min="0"
                              placeholder="Örn: 5000"
                              value={appForm.audience_size}
                              onChange={(e) => setAppForm({ ...appForm, audience_size: e.target.value })}
                              className="h-12 font-bold"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-slate-500 px-1">İçerik Türü</label>
                            <Input
                              required
                              placeholder="Örn: Ev dekorasyonu, yaşam tarzı..."
                              value={appForm.content_type}
                              onChange={(e) => setAppForm({ ...appForm, content_type: e.target.value })}
                              className="h-12 font-bold"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-slate-500 px-1">Profil / Web Sitesi URL</label>
                            <Input
                              placeholder="https://..."
                              value={appForm.profile_url}
                              onChange={(e) => setAppForm({ ...appForm, profile_url: e.target.value })}
                              className="h-12 font-bold"
                            />
                          </div>
                        </div>
                        <div className="bg-olive-50 rounded-2xl p-4 border border-olive-100 text-sm text-olive-700 font-medium">
                          Başvurunuz anında onaylanır ve satış ortaklığı linkinizi hemen kullanabilirsiniz.
                        </div>
                        <Button
                          type="submit"
                          disabled={affiliateApplying}
                          className="w-full h-14 rounded-2xl bg-olive-600 font-black text-lg shadow-lg shadow-olive-100"
                        >
                          {affiliateApplying ? "Başvuruluyor..." : "Satış Ortağı Olmak İstiyorum"}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                ) : (
                  /* Affiliate Dashboard */
                  <div className="space-y-6">
                    {/* Kod Kutusu */}
                    <Card className="border-none shadow-sm overflow-hidden">
                      <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Satış Ortaklığı Kodunuz</p>
                        <div className="flex items-center gap-4">
                          <span className="text-3xl font-black tracking-tight font-mono">{affiliate.code}</span>
                          <button
                            onClick={() => copyAffiliateCode(affiliate.code)}
                            className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                          >
                            <Copy size={14} />
                            {affiliateCopied ? "Kopyalandı!" : "Ortaklık Linkini Kopyala"}
                          </button>
                        </div>
                        <p className="text-slate-400 text-sm mt-3 font-medium">
                          Herhangi bir ürün URL'sine <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-white">?ref={affiliate.code}</code> ekleyin
                        </p>
                      </div>
                    </Card>

                    {/* İstatistikler */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: "Toplam Tıklama", value: affiliate.total_clicks ?? 0, icon: TrendingUp, color: "blue" },
                        { label: "Toplam Sipariş", value: affiliateConversions.filter((c: any) => c.status !== "cancelled").length, icon: Package, color: "green" },
                        { label: "Toplam Kazanç", value: `₺${Number(affiliate.total_earnings || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}`, icon: Banknote, color: "emerald" },
                        { label: "Bekleyen", value: `₺${affiliatePending.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}`, icon: Clock, color: "amber" },
                      ].map(({ label, value, icon: Icon, color }) => (
                        <Card key={label} className="border-none shadow-sm">
                          <CardContent className="p-5 space-y-2">
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center",
                              color === "blue" ? "bg-olive-50 text-olive-600" :
                              color === "green" ? "bg-green-50 text-green-600" :
                              color === "emerald" ? "bg-emerald-50 text-emerald-600" :
                              "bg-amber-50 text-amber-600"
                            )}>
                              <Icon size={20} />
                            </div>
                            <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">{label}</p>
                            <p className="text-xl font-black text-slate-900">{value}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {/* YeriHisset Kredisi cüzdanı */}
                    <Card className="border-none shadow-sm overflow-hidden">
                      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 p-6 text-white">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-100">YeriHisset Kredisi — Bakiye</p>
                        <p className="text-4xl font-black tracking-tight mt-1">
                          ₺{Number(affiliate.credit_balance || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-[12px] text-emerald-100 mt-2 leading-relaxed">
                          Kazandığın komisyonlar burada birikir; sepette <b>indirim olarak</b> kullanabilirsin.
                        </p>
                      </div>
                      {affiliateLedger.length > 0 && (
                        <CardContent className="p-0">
                          <div className="divide-y">
                            {affiliateLedger.map((l: any) => {
                              const positive = Number(l.amount) >= 0;
                              const label = l.type === "earning" ? `Hakediş${l.period ? ` (${l.period})` : ""}` : l.type === "refund" ? "İade" : "Sepette kullanım";
                              return (
                                <div key={l.id} className="flex items-center justify-between px-5 py-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-bold text-slate-800">{label}</p>
                                    <p className="text-[11px] text-slate-400">{new Date(l.created_at).toLocaleDateString("tr-TR")}</p>
                                  </div>
                                  <p className={cn("font-black shrink-0", positive ? "text-emerald-600" : "text-slate-500")}>
                                    {positive ? "+" : ""}₺{Number(l.amount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      )}
                    </Card>

                    {/* Nasıl Kullanılır */}
                    <Card className="border-none shadow-sm bg-slate-50">
                      <CardContent className="p-6">
                        <h4 className="font-bold text-slate-900 mb-3">Link Nasıl Kullanılır?</h4>
                        <p className="text-sm text-slate-600 font-medium leading-relaxed">
                          İstediğiniz herhangi bir ürün URL'sinin sonuna <code className="bg-white border rounded px-1.5 py-0.5 font-mono text-olive-600 text-xs">?ref={affiliate.code}</code> ekleyin.
                        </p>
                        <div className="mt-3 bg-white border rounded-xl p-3 font-mono text-xs text-slate-500 break-all">
                          {`${typeof window !== "undefined" ? window.location.origin : "https://yerihisset.com"}/products/ornek-urun?ref=${affiliate.code}`}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Son Dönüşümler */}
                    {affiliateConversions.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="font-black text-slate-900 text-lg">Son Satışlar</h3>
                        <div className="space-y-2">
                          {affiliateConversions.map((conv: any) => (
                            <div key={conv.id} className="bg-white border rounded-2xl p-4 flex items-center justify-between">
                              <div>
                                <p className="text-sm font-bold text-slate-900">
                                  Sipariş #{conv.order_id.slice(0, 8)}
                                </p>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  {new Date(conv.created_at).toLocaleDateString("tr-TR")} · %{conv.commission_rate} komisyon
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-black text-green-600">+₺{Number(conv.commission_amount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</p>
                                <Badge className={cn(
                                  "text-[10px] font-bold border-none mt-1",
                                  conv.status === "paid" ? "bg-green-100 text-green-700" :
                                  conv.status === "approved" ? "bg-olive-100 text-olive-700" :
                                  conv.status === "cancelled" ? "bg-red-100 text-red-700" :
                                  "bg-amber-100 text-amber-700"
                                )}>
                                  {conv.status === "paid" ? "Ödendi" :
                                   conv.status === "approved" ? "Onaylandı" :
                                   conv.status === "cancelled" ? "İptal" : "Bekliyor"}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
            </AccSection>

          </div>
      </main>

      {/* ─── Sipariş Mesaj Modalı ───────────────────────────────────────────── */}
      {msgOrder && user && (
        <OrderMessagesModal
          orderId={msgOrder.id}
          orderLabel={msgOrder.label}
          userId={user.id}
          initialDraft={msgOrder.draft}
          onClose={() => { setMsgOrder(null); fetchOrderUnread(); }}
          onRead={() => fetchOrderUnread()}
        />
      )}

      {/* ─── Yorum Dialog ───────────────────────────────────────────────────── */}
      {reviewDialog?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {reviewDialog.step === "thanks" ? (
              /* Teşekkür ekranı */
              <div className="flex flex-col items-center justify-center p-10 text-center gap-4">
                <div className="w-20 h-20 bg-olive-100 rounded-full flex items-center justify-center text-4xl">🌿</div>
                <h3 className="text-2xl font-black text-slate-900">Yorumunuz için teşekkürler!</h3>
                <p className="text-slate-500 text-sm">Geri bildiriminiz diğer müşterilerimize yön göstermektedir. En kısa sürede incelenip yayınlanacaktır.</p>
                <Button
                  onClick={() => setReviewDialog(null)}
                  className="mt-2 bg-olive-600 hover:bg-olive-700 font-bold px-8"
                >
                  Siparişlerime Dön
                </Button>
              </div>
            ) : (
              /* Yorum formu */
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-black text-slate-900">Yorum Ekle</h3>
                    <p className="text-xs text-olive-600 font-medium mt-0.5">Yorumlarımız diğer müşterilerimize yön göstermektedir.</p>
                  </div>
                  <button onClick={() => setReviewDialog(null)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
                </div>

                {/* Yıldız puanlamaları */}
                {([
                  { key: "shipping", label: "🚚 Kargo" },
                  { key: "quality",  label: "🎁 Ürün Kalitesi" },
                  { key: "communication", label: "💬 İletişim" },
                ] as { key: keyof typeof reviewRatings; label: string }[]).map(({ key, label }) => (
                  <div key={key} className="space-y-1.5">
                    <p className="text-sm font-bold text-slate-700">{label}</p>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(star => {
                        const active = (reviewHover?.cat === key ? reviewHover.star : reviewRatings[key]) >= star;
                        return (
                          <button
                            key={star}
                            className={`text-2xl transition-transform hover:scale-110 ${active ? "text-yellow-400" : "text-slate-200"}`}
                            onMouseEnter={() => setReviewHover({ cat: key, star })}
                            onMouseLeave={() => setReviewHover(null)}
                            onClick={() => setReviewRatings(prev => ({ ...prev, [key]: star }))}
                          >
                            ★
                          </button>
                        );
                      })}
                      {reviewRatings[key] > 0 && (
                        <span className="text-xs text-slate-400 self-center ml-1">{reviewRatings[key]}/5</span>
                      )}
                    </div>
                  </div>
                ))}

                {/* Yorum metni */}
                <div className="space-y-1.5">
                  <p className="text-sm font-bold text-slate-700">Yorumunuz</p>
                  <textarea
                    rows={4}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-olive-400"
                    placeholder="Deneyiminizi diğer müşterilerle paylaşın…"
                    value={reviewComment}
                    onChange={e => setReviewComment(e.target.value)}
                  />
                </div>

                {/* Görsel ekleme */}
                <div className="space-y-2">
                  <p className="text-sm font-bold text-slate-700">Görsel Ekle <span className="text-slate-400 font-normal">(en fazla 3)</span></p>
                  <div className="flex gap-2 flex-wrap">
                    {reviewPreviews.map((src, i) => (
                      <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="w-full h-full object-cover" />
                        <button
                          onClick={() => removeReviewImage(i)}
                          className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center"
                        >×</button>
                      </div>
                    ))}
                    {reviewImages.length < 3 && (
                      <label className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 hover:border-olive-400 flex items-center justify-center cursor-pointer text-slate-400 hover:text-olive-500 transition-colors text-2xl">
                        +
                        <input type="file" accept="image/*" multiple className="hidden" onChange={handleReviewImageAdd} />
                      </label>
                    )}
                  </div>
                </div>

                {/* Kaydet */}
                <Button
                  onClick={submitReview}
                  disabled={reviewSubmitting || !reviewRatings.shipping || !reviewRatings.quality || !reviewRatings.communication}
                  className="w-full bg-olive-600 hover:bg-olive-700 font-bold h-12 rounded-xl"
                >
                  {reviewSubmitting ? <Loader2 size={16} className="animate-spin" /> : "Yorumu Kaydet"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
