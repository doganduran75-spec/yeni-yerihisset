"use client";

import { useEffect, useState, useRef } from "react";
import { useCartStore } from "@/store/useCartStore";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  MapPin,
  Plus,
  CheckCircle2,
  CreditCard,
  ShieldCheck,
  Truck,
  Ticket,
  X,
  Loader2,
  Landmark,
  Clock,
  IdCard,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { trackBeginCheckout, trackPurchase } from "@/lib/analytics";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? match[2] : null;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, getTotalPrice, clearCart, couponCode: storeCouponCode } = useCartStore();
  const [addresses, setAddresses] = useState<any[]>([]);
  const [selectedShippingId, setSelectedShippingId] = useState<string>("");
  const [selectedBillingId, setSelectedBillingId] = useState<string>("");
  const [isSameAsShipping, setIsSameAsShipping] = useState(true);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [couponData, setCouponData] = useState<{ name: string; type: string; discount_amount: number; free_shipping: boolean } | null>(null);
  const [couponError, setCouponError] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [userCoupons, setUserCoupons] = useState<any[]>([]);
  const [personalInfo, setPersonalInfo] = useState({
    firstName: "",
    lastName: "",
    email: "",
  });
  const [identityNumber, setIdentityNumber] = useState("");
  // Ödeme yöntemi
  const [paymentMethod, setPaymentMethod] = useState<"credit_card" | "bank_transfer">("credit_card");
  const [bankTransferEnabled, setBankTransferEnabled] = useState(false);
  const [bankTransferInfo, setBankTransferInfo] = useState("");
  // iyzico form içeriği (ödeme widgetı)
  const [iyzicoFormHtml, setIyzicoFormHtml] = useState<string | null>(null);
  const iyzicoContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAddresses();
  }, []);

  // iyzico form HTML'i gelince script'leri çalıştır
  useEffect(() => {
    if (!iyzicoFormHtml || !iyzicoContainerRef.current) return;
    const container = iyzicoContainerRef.current;
    container.innerHTML = iyzicoFormHtml;
    // <script> tag'leri innerHTML ile eklenmez — manuel çalıştır
    container.querySelectorAll("script").forEach((oldScript) => {
      const newScript = document.createElement("script");
      Array.from(oldScript.attributes).forEach((attr) =>
        newScript.setAttribute(attr.name, attr.value)
      );
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode?.replaceChild(newScript, oldScript);
    });
  }, [iyzicoFormHtml]);

  // GA4: begin_checkout — sayfa yüklenince (sepette ürün varsa)
  useEffect(() => {
    if (items.length === 0) return;
    const total = getTotalPrice();
    trackBeginCheckout({
      items: items.map((i) => ({
        id: i.product_id,
        title: i.title,
        price: i.price,
        quantity: i.quantity,
        variant_name: i.variant_name,
      })),
      total,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchAddresses() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
       router.push("/login?redirect=/checkout");
       return;
    }

    // Fetch Profile
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (profile) {
      setPersonalInfo({
        firstName: profile.first_name || "",
        lastName: profile.last_name || "",
        email: profile.email || user.email || "",
      });
      if (profile.identity_number) setIdentityNumber(profile.identity_number);
    }

    const { data } = await supabase.from('user_addresses').select('*').eq('user_id', user.id);
    if (data) {
      setAddresses(data);
      const defaultShipping = data.find((a: any) => a.is_default_shipping) || data[0];
      const defaultBilling = data.find((a: any) => a.is_default_billing) || data[0];
      if (defaultShipping) setSelectedShippingId(defaultShipping.id);
      if (defaultBilling) setSelectedBillingId(defaultBilling.id);
    }

    // Ödeme ayarlarını yükle
    const { data: paySettings } = await (supabase
      .from("settings")
      .select("bank_transfer_enabled, bank_transfer_info")
      .single() as any) as { data: { bank_transfer_enabled?: boolean; bank_transfer_info?: string } | null };
    if (paySettings) {
      setBankTransferEnabled(paySettings.bank_transfer_enabled ?? false);
      setBankTransferInfo(paySettings.bank_transfer_info ?? "");
    }

    // Kullanıcının kuponlarını yükle
    const { data: uCoupons } = await supabase
      .from("user_coupons")
      .select("*, coupons(*)")
      .eq("user_id", user.id);
    const now = new Date();
    setUserCoupons(
      (uCoupons || []).filter((uc: any) => {
        const c = uc.coupons;
        if (!c || !c.is_active) return false;
        if (c.expires_at && new Date(c.expires_at) < now) return false;
        if (uc.use_count >= c.per_user_limit) return false;
        return true;
      })
    );

    setLoading(false);
  }

  async function handlePlaceOrder() {
    if (!personalInfo.firstName || !personalInfo.lastName) {
      alert("Lütfen ad ve soyad bilgilerinizi tamamlayın.");
      return;
    }
    if (!selectedShippingId) {
      alert("Lütfen bir teslimat adresi seçin.");
      return;
    }
    // Kredi kartı seçiliyse TC kimlik zorunlu
    if (paymentMethod === "credit_card") {
      if (!identityNumber || identityNumber.replace(/\D/g, "").length !== 11) {
        alert("Lütfen 11 haneli TC Kimlik Numaranızı girin.\niyzico, yasal zorunluluk kapsamında bu bilgiyi talep etmektedir.");
        return;
      }
    }

    setPlacing(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({
        first_name: personalInfo.firstName,
        last_name: personalInfo.lastName,
      }).eq('id', user.id);
    }

    const affiliateCode = getCookie("affiliate_ref") || undefined;
    const totalPrice = getTotalPrice();
    const couponDiscount = couponData?.discount_amount ?? 0;
    const shippingCost = (totalPrice > 500 || couponData?.free_shipping) ? 0 : 29.90;
    const finalTotal = Math.max(0, totalPrice + shippingCost - couponDiscount);

    const { data: { session } } = await supabase.auth.getSession();
    const authToken = session?.access_token;

    // ── Kredi kartı → iyzico akışı ──────────────────────────────────────────
    if (paymentMethod === "credit_card") {
      const res = await fetch("/api/checkout/iyzico/initialize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          items: items.map((item) => ({
            product_id: item.product_id,
            variant_id: item.variant_id,
            variant_name: item.variant_name,
            title: item.title,
            price: item.is_gift ? 0 : item.price,
            quantity: item.quantity,
            is_gift: item.is_gift ?? false,
          })),
          shippingAddressId: selectedShippingId,
          affiliateCode,
          couponCode: couponCode || undefined,
          identityNumber: identityNumber.replace(/\D/g, ""),
        }),
      });

      const data = await res.json();
      setPlacing(false);

      if (!data.ok) {
        alert(data.error || "Ödeme başlatılamadı. Lütfen tekrar deneyin.");
        return;
      }

      // iyzico ödeme formunu sayfaya enjekte et — widget otomatik açılır
      setIyzicoFormHtml(data.checkoutFormContent);
      return;
    }

    // ── Havale / EFT akışı (mevcut) ─────────────────────────────────────────
    const res = await fetch("/api/orders/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({
        items: items.map((item) => ({
          product_id: item.product_id,
          variant_id: item.variant_id,
          variant_name: item.variant_name,
          title: item.title,
          price: item.is_gift ? 0 : item.price,
          quantity: item.quantity,
          is_gift: item.is_gift ?? false,
        })),
        shippingAddressId: selectedShippingId,
        affiliateCode,
        couponCode: couponCode || undefined,
        paymentMethod,
      }),
    });

    const data = await res.json();
    setPlacing(false);

    if (data.orderId) {
      trackPurchase({
        orderId: data.orderId,
        items: items.map((i) => ({
          id: i.product_id,
          title: i.title,
          price: i.price,
          quantity: i.quantity,
          variant_name: i.variant_name,
        })),
        total: finalTotal,
        shipping: shippingCost,
        couponCode: couponCode || undefined,
        affiliateCode: affiliateCode || undefined,
      });
      clearCart();
      setOrderSuccess(data.orderId);
    } else {
      alert(data.error || "Sipariş oluşturulamadı. Lütfen tekrar deneyin.");
    }
  }

  async function handleApplyCoupon(codeArg?: string) {
    const code = (codeArg ?? couponInput).trim().toUpperCase();
    if (!code) return;
    setCouponError("");
    setCouponLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ code, cartTotal: getTotalPrice() }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any = {};
      try { data = await res.json(); } catch { /* JSON değil */ }
      if (res.ok && data.valid) {
        setCouponCode(code);
        setCouponData(data);
      } else {
        setCouponError(data.error || (res.status === 401 ? "Kupon için giriş yapın." : "Geçersiz kupon kodu"));
      }
    } catch {
      setCouponError("Bağlantı hatası, tekrar deneyin.");
    } finally {
      setCouponLoading(false);
    }
  }

  // Sepette seçilen kupon varsa checkout'ta otomatik uygula
  useEffect(() => {
    if (storeCouponCode && !couponData) {
      setCouponInput(storeCouponCode);
      handleApplyCoupon(storeCouponCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeCouponCode]);

  function removeCoupon() {
    setCouponCode("");
    setCouponInput("");
    setCouponData(null);
    setCouponError("");
  }

  // URL'den hata parametresini oku (iyzico başarısız callback)
  const paymentFailed = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("hatali") === "1";

  if (loading) return <div className="min-h-screen flex items-center justify-center animate-pulse text-blue-600 font-bold">Ödeme Sayfası Hazırlanıyor...</div>;

  if (orderSuccess) {
    const isBankTransfer = paymentMethod === "bank_transfer";
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-12 max-w-md w-full text-center space-y-6">
          <div className={cn(
            "w-20 h-20 rounded-full flex items-center justify-center mx-auto",
            isBankTransfer ? "bg-amber-100" : "bg-green-100"
          )}>
            {isBankTransfer
              ? <Clock size={40} className="text-amber-600" />
              : <CheckCircle2 size={40} className="text-green-600" />}
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-900 mb-2">
              {isBankTransfer ? "Siparişiniz Oluşturuldu!" : "Siparişiniz Alındı!"}
            </h2>
            <p className="text-slate-500 font-medium">Sipariş numaranız: <span className="font-bold text-slate-900">#{orderSuccess.slice(0, 8)}</span></p>
          </div>
          {isBankTransfer ? (
            <div className="space-y-4 text-left">
              <p className="text-sm text-slate-600 font-medium leading-relaxed text-center">
                Havaleyi gerçekleştirdiğinizde siparişinizi işleme alacağız.
              </p>
              {bankTransferInfo && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Landmark size={12} /> Banka Bilgileri
                  </p>
                  <pre className="text-xs text-slate-700 font-medium whitespace-pre-wrap leading-relaxed">{bankTransferInfo}</pre>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500 font-medium leading-relaxed">
              Siparişinizi hazırlamaya başladık. E-posta adresinize bildirim gönderilecektir.
            </p>
          )}
          <div className="flex flex-col gap-3">
            <Link href="/account?tab=orders" className={cn(buttonVariants({ variant: "default" }), "h-12 rounded-2xl bg-blue-600 font-bold")}>
              Siparişlerimi Gör
            </Link>
            <Link href="/" className={cn(buttonVariants({ variant: "ghost" }), "h-12 rounded-2xl font-bold")}>
              Alışverişe Devam Et
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    router.push("/cart");
    return null;
  }

  const totalPrice = getTotalPrice();
  const couponDiscount = couponData?.discount_amount ?? 0;
  const shippingCost = (totalPrice > 500 || couponData?.free_shipping) ? 0 : 29.90;
  const finalTotal = Math.max(0, totalPrice + shippingCost - couponDiscount);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* iyzico ödeme formu overlay */}
      {iyzicoFormHtml && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg relative overflow-hidden">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
              <span className="text-white font-black text-sm uppercase tracking-widest">Güvenli Ödeme — iyzico</span>
              <button
                onClick={() => setIyzicoFormHtml(null)}
                className="text-slate-400 hover:text-white transition-colors"
                title="Kapat"
              >
                <X size={20} />
              </button>
            </div>
            <div ref={iyzicoContainerRef} className="p-4" />
          </div>
        </div>
      )}

      {/* Ödeme hatası banner */}
      {paymentFailed && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-6 py-3 rounded-2xl shadow-xl font-bold text-sm flex items-center gap-2 animate-in slide-in-from-top-4">
          <X size={16} /> Ödeme işlemi tamamlanamadı. Lütfen tekrar deneyin.
        </div>
      )}

      <Navbar variant="minimal" />

      <main className="container mx-auto px-4 py-8 md:py-16">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-12 gap-12">
          {/* MAIN FLOW */}
          <div className="lg:col-span-8 space-y-12">
            
            {/* Step 0: Personal Info */}
            <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
               <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-black shadow-lg shadow-blue-100 italic">01</div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Müşteri Bilgileri</h3>
               </div>
               <div className="bento-card bg-white !p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] px-1">E-POSTA ADRESİ</label>
                      <div className="relative">
                        <Input 
                          value={personalInfo.email}
                          disabled
                          className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-bold opacity-60 cursor-not-allowed pl-4"
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400 uppercase">Sabit</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] px-1">ADINIZ</label>
                        <Input
                          value={personalInfo.firstName}
                          onChange={e => setPersonalInfo({...personalInfo, firstName: e.target.value})}
                          placeholder="Ad"
                          className="h-14 rounded-2xl bg-white border-slate-200 font-bold focus:ring-blue-600"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] px-1">SOYADINIZ</label>
                        <Input
                          value={personalInfo.lastName}
                          onChange={e => setPersonalInfo({...personalInfo, lastName: e.target.value})}
                          placeholder="Soyad"
                          className="h-14 rounded-2xl bg-white border-slate-200 font-bold focus:ring-blue-600"
                        />
                      </div>
                    </div>

                    {/* TC Kimlik — iyzico + yasal zorunluluk */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] px-1 flex items-center gap-1.5">
                        <IdCard size={12} /> TC KİMLİK NUMARASI
                      </label>
                      <Input
                        value={identityNumber}
                        onChange={e => setIdentityNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
                        placeholder="Örn: 12345678901"
                        maxLength={11}
                        className="h-14 rounded-2xl bg-white border-slate-200 font-bold font-mono tracking-widest focus:ring-blue-600"
                      />
                      <p className="text-[10px] text-slate-400 font-medium px-1 leading-relaxed">
                        <span className="text-blue-500 font-bold">Yasal zorunluluk:</span> iyzico, 6493 sayılı Ödeme Hizmetleri Kanunu gereğince kimlik doğrulaması yapmaktadır. Bilgileriniz yalnızca fatura ve ödeme işlemleri için kullanılır.
                      </p>
                    </div>
                  </div>
               </div>
            </section>

            {/* Step 1: Shipping Address */}
            <section className="space-y-6 animate-in fade-in slide-in-from-bottom-6">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-black shadow-lg shadow-blue-100 italic">02</div>
                    <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Teslimat Adresi</h3>
                  </div>
                  <Link href="/account?tab=addresses" className="text-blue-600 font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:translate-x-1 transition-transform">
                    <Plus size={16} /> ADRES EKLE
                  </Link>
               </div>

               {addresses.length === 0 ? (
                 <div 
                  className="bento-card border-2 border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center py-16 gap-4 group cursor-pointer" 
                  onClick={() => router.push("/account?tab=addresses")}
                 >
                    <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-slate-300 group-hover:text-blue-600 transition-colors shadow-sm">
                      <MapPin size={32} />
                    </div>
                    <p className="text-sm font-bold text-slate-500 text-center leading-relaxed italic">
                      Henüz kayıtlı adresiniz bulunmuyor. <br/> 
                      <span className="text-blue-600 not-italic uppercase font-black tracking-widest text-xs">YENİ ADRES EKLEMEK İÇİN TIKLAYIN</span>
                    </p>
                 </div>
               ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   {addresses.map((addr) => (
                     <div 
                      key={addr.id}
                      onClick={() => setSelectedShippingId(addr.id)}
                      className={cn(
                        "bento-card !p-6 cursor-pointer relative transition-all duration-300",
                        selectedShippingId === addr.id 
                          ? "border-blue-600 bg-blue-50/30 group ring-4 ring-blue-50" 
                          : "bg-white hover:border-slate-300"
                      )}
                     >
                        <div className="flex justify-between items-start mb-4">
                           <span className={cn(
                             "text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full",
                             selectedShippingId === addr.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                           )}>
                             {addr.address_name}
                           </span>
                           {selectedShippingId === addr.id && (
                             <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg animate-in zoom-in">
                               <CheckCircle2 size={14} />
                             </div>
                           )}
                        </div>
                        <p className="font-black text-slate-900 text-lg italic uppercase">{addr.first_name} {addr.last_name}</p>
                        <div className="space-y-1 mt-3">
                           <p className="text-xs text-slate-500 font-medium line-clamp-2 leading-relaxed">{addr.address_detail}</p>
                           <p className="text-xs font-black text-slate-900 uppercase tracking-tight italic">{addr.district} / {addr.city}</p>
                        </div>
                     </div>
                   ))}
                 </div>
               )}
            </section>

            {/* Step 2: Billing Address */}
            <section className="space-y-6 animate-in fade-in slide-in-from-bottom-8">
               <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-black shadow-lg shadow-blue-100 italic">03</div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Fatura Bilgileri</h3>
               </div>
               
               <div className="bento-card bg-white !p-0 overflow-hidden">
                  <div 
                    className="p-8 flex items-center gap-4 cursor-pointer select-none bg-blue-50/30 border-b border-blue-100 transition-colors hover:bg-blue-50/50"
                    onClick={() => setIsSameAsShipping(!isSameAsShipping)}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all shadow-sm",
                      isSameAsShipping ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200"
                    )}>
                      {isSameAsShipping && <CheckCircle2 size={18} />}
                    </div>
                    <span className="text-md font-bold text-slate-800 uppercase italic tracking-tight">Fatura adresim teslimatla aynı olsun</span>
                  </div>

                  {!isSameAsShipping && (
                    <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-4">
                       {addresses.map((addr) => (
                         <div 
                          key={addr.id}
                          onClick={() => setSelectedBillingId(addr.id)}
                          className={cn(
                            "bento-card !p-6 cursor-pointer transition-all",
                            selectedBillingId === addr.id ? "border-blue-600 bg-blue-50/30 ring-4 ring-blue-50" : "bg-white"
                          )}
                         >
                            <div className="flex justify-between items-start mb-4">
                               <span className="text-[9px] font-black uppercase tracking-[0.2em] bg-slate-100 text-slate-500 px-3 py-1 rounded-full">{addr.address_name}</span>
                               {selectedBillingId === addr.id && <CheckCircle2 size={18} className="text-blue-600 animate-in zoom-in" />}
                            </div>
                            <p className="font-black text-slate-900 text-md italic uppercase">{addr.first_name} {addr.last_name}</p>
                            <p className="text-xs text-slate-500 mt-2 font-medium line-clamp-1">{addr.address_detail}</p>
                         </div>
                       ))}
                    </div>
                  )}
               </div>
            </section>

            {/* Step 3: Payment */}
            <section className="space-y-6 animate-in fade-in slide-in-from-bottom-10">
               <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-black shadow-lg shadow-blue-100 italic">04</div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Ödeme Yöntemi</h3>
               </div>
               <div className={cn("grid gap-6", bankTransferEnabled ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1")}>
                  {/* Kredi Kartı */}
                  <div
                    onClick={() => setPaymentMethod("credit_card")}
                    className={cn(
                      "bento-card flex flex-col items-center justify-center gap-6 py-12 cursor-pointer transition-all duration-300 group relative",
                      paymentMethod === "credit_card"
                        ? "!bg-slate-900 border-none ring-0"
                        : "bg-white hover:border-slate-300"
                    )}
                  >
                     <div className={cn(
                       "w-20 h-20 rounded-[2rem] flex items-center justify-center transition-transform group-hover:scale-110",
                       paymentMethod === "credit_card" ? "bg-white/10 text-blue-400" : "bg-slate-100 text-slate-500"
                     )}>
                        <CreditCard size={40} />
                     </div>
                     <div className="text-center space-y-2">
                        <p className={cn("font-black text-xl uppercase italic tracking-tight", paymentMethod === "credit_card" ? "text-white" : "text-slate-800")}>Kredi / Banka Kartı</p>
                        <p className={cn("text-[10px] font-bold uppercase tracking-widest", paymentMethod === "credit_card" ? "text-slate-400" : "text-slate-400")}>iyzico Güvencesiyle Ödeyin</p>
                     </div>
                     {paymentMethod === "credit_card" && (
                       <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg animate-in zoom-in absolute top-4 right-4">
                         <CheckCircle2 size={14} />
                       </div>
                     )}
                  </div>

                  {/* Havale / EFT — sadece admin aktif ettiyse göster */}
                  {bankTransferEnabled && (
                    <div
                      onClick={() => setPaymentMethod("bank_transfer")}
                      className={cn(
                        "bento-card flex flex-col items-center justify-center gap-6 py-12 cursor-pointer transition-all duration-300 group relative",
                        paymentMethod === "bank_transfer"
                          ? "!bg-amber-50 border-amber-300 ring-4 ring-amber-50"
                          : "bg-white hover:border-amber-200"
                      )}
                    >
                       <div className={cn(
                         "w-20 h-20 rounded-[2rem] flex items-center justify-center transition-transform group-hover:scale-110",
                         paymentMethod === "bank_transfer" ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"
                       )}>
                          <Landmark size={40} />
                       </div>
                       <div className="text-center space-y-2">
                          <p className={cn("font-black text-xl uppercase italic tracking-tight", paymentMethod === "bank_transfer" ? "text-amber-900" : "text-slate-800")}>Havale / EFT</p>
                          <p className={cn("text-[10px] font-bold uppercase tracking-widest", paymentMethod === "bank_transfer" ? "text-amber-600" : "text-slate-400")}>Banka Havalesiyle Ödeyin</p>
                       </div>
                       {paymentMethod === "bank_transfer" && (
                         <div className="w-6 h-6 bg-amber-500 text-white rounded-full flex items-center justify-center shadow-lg animate-in zoom-in absolute top-4 right-4">
                           <CheckCircle2 size={14} />
                         </div>
                       )}
                    </div>
                  )}
               </div>

               {/* Banka bilgileri — Havale seçilince göster */}
               {paymentMethod === "bank_transfer" && bankTransferInfo && (
                 <div className="bento-card bg-amber-50 border-amber-200 !p-6 space-y-3 animate-in fade-in slide-in-from-top-4">
                   <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-2">
                     <Landmark size={12} /> Havale / EFT Banka Bilgileri
                   </p>
                   <pre className="text-sm text-slate-700 font-medium whitespace-pre-wrap leading-relaxed">{bankTransferInfo}</pre>
                   <div className="flex items-start gap-2 mt-2 text-xs text-amber-700 font-medium bg-amber-100 rounded-xl p-3">
                     <Clock size={14} className="shrink-0 mt-0.5" />
                     <span>Havaleyi gerçekleştirdiğinizde siparişinizi işleme alacağız. Açıklama kısmına sipariş numaranızı yazmayı unutmayın.</span>
                   </div>
                 </div>
               )}
            </section>
          </div>

          {/* SIDEBAR SUMMARY */}
          <div className="lg:col-span-4 relative">
            <div className="sticky top-32 space-y-8 animate-in fade-in slide-in-from-right duration-1000">
               <div className="bento-card !p-0 bg-white shadow-2xl shadow-slate-200/50">
                  <div className="bg-slate-900 p-8 text-white relative overflow-hidden">
                     <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600 blur-[80px] opacity-30 -mr-16 -mt-16" />
                     <h2 className="text-2xl font-black uppercase tracking-tighter italic relative z-10">Sipariş Özeti</h2>
                     <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] relative z-10 mt-1">Ödeme Öncesi Son Kontrol</p>
                  </div>
                  
                  <div className="p-8 space-y-8">
                    {/* Item Thumbnails (Juicy version) */}
                    <div className="flex -space-x-5 overflow-hidden py-2">
                      {items.slice(0, 5).map((item, idx) => (
                        <div key={idx} className="inline-block h-16 w-16 rounded-2xl ring-4 ring-white shadow-xl overflow-hidden bg-slate-100 transform hover:-translate-y-2 transition-transform duration-500">
                          <img src={item.image} alt="" className="h-full w-full object-cover" />
                        </div>
                      ))}
                      {items.length > 5 && (
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 ring-4 ring-white text-sm font-black text-slate-500 shadow-xl italic">
                          +{items.length - 5}
                        </div>
                      )}
                    </div>

                    <div className="space-y-4 font-bold uppercase italic tracking-tighter italic">
                      <div className="flex justify-between text-slate-500 text-sm">
                        <span>Ürün Toplamı</span>
                        <span className="text-slate-900 text-lg">₺{totalPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-slate-500 text-sm">
                        <span>Kargo Ücreti</span>
                        <span className={cn(shippingCost === 0 ? "text-green-600" : "text-slate-900", "text-lg")}>
                          {shippingCost === 0 ? "ÜCRETSİZ" : `₺${shippingCost.toLocaleString('tr-TR')}`}
                        </span>
                      </div>
                      {couponDiscount > 0 && (
                        <div className="flex justify-between text-green-600 text-sm">
                          <span>Kupon İndirimi</span>
                          <span className="text-lg">-₺{couponDiscount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                    </div>

                    {/* Kupon Alanı */}
                    <div className="space-y-3">
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-1.5">
                        <Ticket size={12} /> KUPON / İNDİRİM KODU
                      </p>

                      {couponData ? (
                        /* Kupon uygulandı */
                        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
                          <div>
                            <p className="text-xs font-black text-green-800">{couponData.name}</p>
                            <p className="text-[10px] text-green-600 font-mono font-bold">{couponCode}</p>
                          </div>
                          <button onClick={removeCoupon} className="text-green-500 hover:text-red-500 transition-colors p-1">
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        /* Kupon giriş alanı */
                        <div className="space-y-2">
                          {/* Kullanılabilir kuponlar seçici */}
                          {userCoupons.length > 0 && (
                            <select
                              className="flex h-10 w-full rounded-xl border border-input bg-slate-50/50 px-3 py-2 text-xs font-bold"
                              value=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  setCouponInput(e.target.value);
                                }
                              }}
                            >
                              <option value="">— Kayıtlı kupon seç —</option>
                              {userCoupons.map((uc) => (
                                <option key={uc.id} value={uc.coupons?.code}>
                                  {uc.coupons?.code} — {uc.coupons?.name}
                                </option>
                              ))}
                            </select>
                          )}
                          <div className="flex gap-2">
                            <Input
                              value={couponInput}
                              onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                              placeholder="KUPON KODU"
                              className="h-10 rounded-xl font-mono font-bold text-sm tracking-widest"
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleApplyCoupon(); } }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-10 px-4 font-bold shrink-0 rounded-xl"
                              onClick={handleApplyCoupon}
                              disabled={couponLoading || !couponInput.trim()}
                            >
                              {couponLoading ? <Loader2 size={14} className="animate-spin" /> : "Uygula"}
                            </Button>
                          </div>
                          {couponError && (
                            <p className="text-xs text-red-500 font-medium">{couponError}</p>
                          )}
                        </div>
                      )}
                    </div>

                    <Separator className="bg-slate-100" />
                    
                    <div className="flex flex-col gap-1 p-6 bg-blue-50/50 rounded-3xl border-2 border-blue-100 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-16 h-16 bg-blue-100 blur-3xl opacity-50 group-hover:scale-150 transition-transform duration-1000" />
                      <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest leading-none">Ödenecek Tutar</span>
                      <span className="text-4xl font-black text-blue-600 italic tracking-tighter pt-1">
                        ₺{finalTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <Button
                      onClick={handlePlaceOrder}
                      disabled={placing || !selectedShippingId}
                      className="w-full h-20 rounded-[2rem] bg-blue-600 hover:bg-blue-700 text-xl font-black shadow-2xl shadow-blue-100 uppercase tracking-tighter group mt-2 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {placing ? "Hazırlanıyor..." : <>SİPARİŞİ TAMAMLA <ArrowRight size={24} className="ml-2 group-hover:translate-x-3 transition-transform duration-500" /></>}
                    </Button>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-3 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 p-3 rounded-2xl">
                        <ShieldCheck size={16} className="text-green-500" />
                        <span>Güvenli <br/> Ödeme</span>
                      </div>
                      <div className="flex items-center gap-3 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 p-3 rounded-2xl">
                        <Truck size={16} className="text-blue-500" />
                        <span>Ücretsiz <br/> Sigorta</span>
                      </div>
                    </div>
                  </div>
               </div>

               <div className="p-8 bg-blue-600/5 rounded-[2rem] border-2 border-blue-100 border-dashed text-center">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest leading-relaxed italic">
                     "Siparişi Tamamla" butonuna basarak Mesafeli Satış Sözleşmesi'ni ve Ön Bilgilendirme Formu'nu kabul etmiş sayılırsınız.
                  </p>
               </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
