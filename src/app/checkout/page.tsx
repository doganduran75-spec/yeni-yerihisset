"use client";

import { useEffect, useState, useRef } from "react";
import { useCartStore } from "@/store/useCartStore";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Image from "next/image";
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
  Banknote,
  PackageX,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { trackBeginCheckout, trackPurchase } from "@/lib/analytics";
import { GeoSelect } from "@/components/ui/geo-select";
import { CITIES, DISTRICTS } from "@/lib/turkey-geo";
import { fetchLiveStocks } from "@/lib/live-stock";
import { shipFee } from "@/lib/shipping-fee";
import CheckoutStepper from "@/components/CheckoutStepper";
import { track } from "@/lib/track";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? match[2] : null;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, getTotalPrice, clearCart, couponCode: storeCouponCode } = useCartStore();
  const [addresses, setAddresses] = useState<any[]>([]);
  const [isGuest, setIsGuest] = useState(false); // giriş yapmadan alışveriş
  const [guestAddr, setGuestAddr] = useState({ phone: "", city: "", district: "", addressDetail: "" });
  const [shippingMethods, setShippingMethods] = useState<any[]>([]);
  const [selectedShippingMethodId, setSelectedShippingMethodId] = useState<string>("");
  const [shippingLoaded, setShippingLoaded] = useState(false);
  // Eksik alan doğrulaması — Sipariş Ver'e basınca ilk eksiğe kaydırır + kırmızı yapar
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const errCls = (k: string) => errors[k] ? " !border-red-400 ring-2 ring-red-200" : "";
  const clearErr = (k: string) => setErrors((e) => (e[k] ? { ...e, [k]: false } : e));
  const [selectedShippingId, setSelectedShippingId] = useState<string>("");
  const [selectedBillingId, setSelectedBillingId] = useState<string>("");
  const [isSameAsShipping, setIsSameAsShipping] = useState(true);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [successTotal, setSuccessTotal] = useState<number | null>(null); // başarı ekranında ödenecek tutar
  const [activationState, setActivationState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [couponCode, setCouponCode] = useState("");
  const [couponData, setCouponData] = useState<{ name: string; type: string; discount_amount: number; free_shipping: boolean } | null>(null);
  const [couponError, setCouponError] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  // YeriHisset Kredisi (mağaza kredisi) — cüzdan bakiyesi + uygulanan tutar
  const [creditBalance, setCreditBalance] = useState(0);
  const [creditInput, setCreditInput] = useState("");
  const [personalInfo, setPersonalInfo] = useState({
    firstName: "",
    lastName: "",
    email: "",
  });
  const [identityNumber, setIdentityNumber] = useState("");
  const [emailExists, setEmailExists] = useState(false); // misafir e-postası zaten kayıtlı
  // Site içi uyarılar (tarayıcı alert'i yerine)
  const [stockProblems, setStockProblems] = useState<{ id: string; title: string; variant: string | null; qty: number; live: number }[] | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const leavingRef = useRef(false);
  // Ödeme yöntemi
  const [paymentMethod, setPaymentMethod] = useState<"credit_card" | "bank_transfer">("credit_card");
  const [bankTransferEnabled, setBankTransferEnabled] = useState(false);
  const [bankTransferInfo, setBankTransferInfo] = useState("");
  // iyzico form içeriği (ödeme widgetı)
  const [iyzicoFormHtml, setIyzicoFormHtml] = useState<string | null>(null);
  const iyzicoContainerRef = useRef<HTMLDivElement>(null);
  // Akış: Sepet › TESLİMAT (bilgi + adres + kargo) › ÖDEME (özet + ödeme + onay)
  const [step, setStep] = useState<"teslimat" | "odeme">("teslimat");
  const DELIVERY_KEYS = ["email", "firstName", "lastName", "phone", "city", "district", "address", "shipping"];

  // Tarayıcı geri tuşu: ödemeden teslimata dön
  useEffect(() => {
    const onPop = () => {
      const onPay = new URLSearchParams(window.location.search).get("adim") === "odeme";
      setStep(onPay ? "odeme" : "teslimat");
    };
    window.addEventListener("popstate", onPop);
    // Ödeme adımında sayfa yenilenirse bilgiler kaybolur → teslimattan başla
    if (new URLSearchParams(window.location.search).get("adim") === "odeme") {
      window.history.replaceState(null, "", "/checkout");
    }
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    fetchAddresses();
  }, []);

  // Aktif kargo yöntemlerini yükle (checkout'ta seçilecek)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("shipping_methods").select("*").eq("is_active", true).order("sort_order");
      const list = (data as any[]) || [];
      setShippingMethods(list);
      setShippingLoaded(true);
      // Sepette seçilen yöntem (hâlâ aktifse) önseçili gelsin
      const fromCart = useCartStore.getState().shippingMethodId;
      setSelectedShippingMethodId((prev) => prev || (list.some((m) => m.id === fromCart) ? fromCart : (list[0]?.id ?? "")));
    })();
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

  async function loadPaymentSettings() {
    const { data: paySettings } = await (supabase
      .from("settings")
      .select("bank_transfer_enabled, bank_transfer_info")
      .single() as any) as { data: { bank_transfer_enabled?: boolean; bank_transfer_info?: string } | null };
    if (paySettings) {
      setBankTransferEnabled(paySettings.bank_transfer_enabled ?? false);
      setBankTransferInfo(paySettings.bank_transfer_info ?? "");
    }
  }

  async function fetchAddresses() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Misafir: giriş zorunlu değil — bilgileri elle girer, sipariş sırasında
      // şifresiz üye oluşturulur.
      setIsGuest(true);
      await loadPaymentSettings();
      setLoading(false);
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

    // YeriHisset Kredisi bakiyesi (varsa) — cüzdanı sepette indirim olarak kullanabilir
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const r = await fetch("/api/affiliate/stats", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const d = await r.json();
        const bal = Number(d?.affiliate?.credit_balance || 0);
        if (bal > 0) setCreditBalance(bal);
      }
    } catch { /* kritik değil */ }

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

    setLoading(false);
  }

  // Misafir e-postası zaten üye mi? (alandan çıkınca hızlı kontrol; hız sınırlı)
  async function checkGuestEmail() {
    const email = personalInfo.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
    try {
      const res = await fetch("/api/checkout/email-check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await res.json();
      if (d.exists === true) { setEmailExists(true); setErrors((p) => ({ ...p, email: true })); }
      else if (d.exists === false) setEmailExists(false);
    } catch { /* kontrol kritik değil; sipariş anında zaten yapılır */ }
  }

  // Teslimat adımı eksikleri (iletişim + adres)
  function deliveryErrors(): Record<string, boolean> {
    const e: Record<string, boolean> = {};
    if (isGuest && (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(personalInfo.email.trim()) || emailExists)) e.email = true;
    if (!personalInfo.firstName.trim()) e.firstName = true;
    if (!personalInfo.lastName.trim()) e.lastName = true;
    if (isGuest) {
      if (guestAddr.phone.length !== 10) e.phone = true;
      if (!guestAddr.city) e.city = true;
      if (!guestAddr.district) e.district = true;
      if (!guestAddr.addressDetail.trim()) e.address = true;
    } else if (!selectedShippingId) {
      e.shipping = true;
    }
    return e;
  }

  // İlk eksik alana kaydır + odakla
  function focusFirstError(e: Record<string, boolean>) {
    const order = ["email", "firstName", "lastName", "phone", "city", "district", "address", "shipping", "tckn"];
    const firstKey = order.find((k) => e[k]);
    const el = firstKey ? document.getElementById(`f-${firstKey}`) : null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => (el.querySelector("input, textarea") as HTMLElement | null)?.focus?.(), 400);
    }
  }

  function goToTeslimat() {
    setStep("teslimat");
    if (new URLSearchParams(window.location.search).get("adim") === "odeme") window.history.back();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // "Ödeme adımına geç" — teslimat bilgileri tamamsa ödeme adımına
  function goToOdeme() {
    const e = deliveryErrors();
    setErrors(e);
    if (Object.keys(e).length > 0) { focusFirstError(e); return; }
    setStep("odeme");
    window.history.pushState(null, "", "/checkout?adim=odeme");
    window.scrollTo({ top: 0, behavior: "smooth" });
    track("checkout_step", { step: "odeme" });
  }

  async function handlePlaceOrder() {
    // ── Eksik alan doğrulaması ─────────────────────────────────────────────
    const e: Record<string, boolean> = deliveryErrors();
    if (paymentMethod === "credit_card" && identityNumber.replace(/\D/g, "").length !== 11) e.tckn = true;

    setErrors(e);
    if (Object.keys(e).length > 0) {
      // Teslimat bilgisi eksikse o adıma dön
      if (Object.keys(e).some((k) => DELIVERY_KEYS.includes(k)) && step !== "teslimat") {
        goToTeslimat();
        setTimeout(() => focusFirstError(e), 350);
      } else {
        focusFirstError(e);
      }
      return;
    }

    setPlacing(true);

    // Göndermeden önce canlı stok kontrolü — tükenen varsa site içi uyarı
    if (await showStockProblemIfAny()) { setPlacing(false); return; }

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
    const _selMethod = shippingMethods.find((m) => m.id === selectedShippingMethodId) || shippingMethods[0];
    const shippingCost = shipFee(_selMethod, totalPrice, !!couponData?.free_shipping);
    const preCreditTotal = Math.max(0, totalPrice + shippingCost - couponDiscount);
    const creditApplied = Math.min(Math.max(0, Number(creditInput) || 0), creditBalance, preCreditTotal);
    const finalTotal = Math.max(0, Math.round((preCreditTotal - creditApplied) * 100) / 100);

    const { data: { session } } = await supabase.auth.getSession();
    const authToken = session?.access_token;

    // Misafir bilgisi (giriş yoksa) — sunucu şifresiz üye oluşturur
    const guestPayload = isGuest ? {
      email: personalInfo.email.trim(),
      firstName: personalInfo.firstName.trim(),
      lastName: personalInfo.lastName.trim(),
      phone: guestAddr.phone,
      city: guestAddr.city,
      district: guestAddr.district,
      addressDetail: guestAddr.addressDetail.trim(),
    } : undefined;

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
          shippingAddressId: isGuest ? undefined : selectedShippingId,
          guest: guestPayload,
          shippingMethodId: selectedShippingMethodId || undefined,
          billingAddressId: isSameAsShipping ? null : (selectedBillingId || null),
          billingSameAsShipping: isSameAsShipping,
          affiliateCode,
          couponCode: couponCode || undefined,
          identityNumber: identityNumber.replace(/\D/g, ""),
          creditApply: creditApplied,
        }),
      });

      const data = await res.json();
      setPlacing(false);

      if (!data.ok) {
        // Stok yarışı (bu arada tükendi) → ürün bazlı uyarı; değilse genel hata kutusu
        if (!(await showStockProblemIfAny())) setOrderError(data.error || "Ödeme başlatılamadı. Lütfen tekrar deneyin.");
        return;
      }

      // Kredi tüm tutarı karşıladıysa iyzico'ya gerek yok — sipariş tamamlandı
      if (data.fullyCredited) {
        trackPurchase({
          orderId: data.orderId,
          items: items.map((i) => ({ id: i.product_id, title: i.title, price: i.price, quantity: i.quantity, variant_name: i.variant_name })),
          total: 0,
          shipping: shippingCost,
          couponCode: couponCode || undefined,
          affiliateCode: affiliateCode || undefined,
        });
        clearCart();
        setSuccessTotal(0);
        setOrderSuccess(data.orderId);
        setOrderNumber(data.orderNumber ?? null);
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
        shippingAddressId: isGuest ? undefined : selectedShippingId,
        guest: guestPayload,
        shippingMethodId: selectedShippingMethodId || undefined,
        billingAddressId: isSameAsShipping ? null : (selectedBillingId || null),
        billingSameAsShipping: isSameAsShipping,
        affiliateCode,
        couponCode: couponCode || undefined,
        paymentMethod,
        creditApply: creditApplied,
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
      setSuccessTotal(typeof data.totalAmount === "number" ? data.totalAmount : finalTotal);
      setOrderSuccess(data.orderId);
      setOrderNumber(data.orderNumber ?? null);
    } else {
      if (!(await showStockProblemIfAny())) setOrderError(data.error || "Sipariş oluşturulamadı. Lütfen tekrar deneyin.");
    }
  }

  // Sepetteki (hediye olmayan) kalemlerin canlı stoğunu kontrol et; yetmeyen
  // varsa uyarı penceresini aç ve true dön.
  async function showStockProblemIfAny(): Promise<boolean> {
    const regs = items.filter((i) => !i.is_gift);
    if (!regs.length) return false;
    try {
      const live = await fetchLiveStocks(regs.map((i) => i.product_id));
      const problems = regs
        .map((i) => ({
          id: i.id, title: i.title, variant: i.variant_name ?? null, qty: i.quantity,
          live: i.variant_id ? (live.variants.get(i.variant_id) ?? 0) : (live.products.get(i.product_id) ?? 0),
        }))
        .filter((p) => p.live < p.qty);
      if (!problems.length) return false;
      setStockProblems(problems);
      return true;
    } catch {
      return false; // okunamazsa sunucu yine doğrular
    }
  }

  // Uyarıda "Tamam": tükeneni sepetten çıkar, azalanı stoğa indir; sepet boşaldıysa
  // Mağaza'ya, ürün kaldıysa güncel sepeti görsün diye Sepet'e dön.
  function resolveStockProblems() {
    leavingRef.current = true;
    const store = useCartStore.getState();
    for (const p of stockProblems ?? []) {
      if (p.live <= 0) store.removeItem(p.id);
      else { store.syncStock({ [p.id]: p.live }); store.updateQuantity(p.id, p.live); }
    }
    const remaining = useCartStore.getState().items.filter((i) => !i.is_gift).length;
    setStockProblems(null);
    router.push(remaining > 0 ? "/sepet" : "/products");
  }

  // Kupon YALNIZ sepette girilir; burada sepetteki kod doğrulanıp tutarı hesaplanır.
  async function handleApplyCoupon(codeArg: string) {
    const code = codeArg.trim().toUpperCase();
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
      handleApplyCoupon(storeCouponCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeCouponCode]);

  // URL'den hata parametresini oku (iyzico başarısız callback)
  const paymentFailed = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("hatali") === "1";

  if (loading) return <div className="min-h-screen flex items-center justify-center animate-pulse text-olive-600 font-bold">Ödeme Sayfası Hazırlanıyor...</div>;

  if (orderSuccess) {
    // Kredi tüm tutarı karşıladıysa ödeme beklenmez → havale ekranı gösterilmez
    const isBankTransfer = paymentMethod === "bank_transfer" && (successTotal ?? 1) > 0;
    const orderLabel = orderNumber ? `YH${orderNumber}` : `#${orderSuccess.slice(0, 8).toUpperCase()}`;
    const email = personalInfo.email.trim();

    async function resendActivation() {
      setActivationState("sending");
      try {
        const res = await fetch("/api/orders/guest-activation", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: orderSuccess }),
        });
        setActivationState(res.ok ? "sent" : "error");
      } catch { setActivationState("error"); }
    }

    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4 py-10">
        <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-10 max-w-lg w-full space-y-6">
          {/* ÜST — Siparişini aldık */}
          <div className="text-center space-y-3">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <CheckCircle2 size={40} className="text-green-600" />
            </div>
            <h2 className="text-3xl font-black text-slate-900">Siparişini aldık!</h2>
            <p className="text-slate-500 font-medium">
              {isBankTransfer ? "Ödemen ulaştığında siparişini hazırlayıp kargoya vereceğiz." : "Siparişini hazırlamaya başladık."}
            </p>
          </div>

          {/* ALT — Sipariş / ödeme bilgileri */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3"><span className="text-slate-500">Sipariş No</span><span className="font-black text-slate-900">{orderLabel}</span></div>
            {successTotal !== null && (
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">{isBankTransfer ? "Ödenecek Tutar" : "Toplam"}</span>
                <span className="font-black text-olive-600">₺{successTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} <span className="text-[10px] font-medium text-slate-400">KDV dahil</span></span>
              </div>
            )}
          </div>

          {isBankTransfer && bankTransferInfo && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
              <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-1">
                <Landmark size={12} /> Havale / EFT Banka Bilgileri
              </p>
              <pre className="text-xs text-slate-700 font-medium whitespace-pre-wrap leading-relaxed">{bankTransferInfo}</pre>
              <p className="text-xs font-bold text-amber-800">
                Açıklama kısmına sipariş numaranı (<span className="font-mono">{orderLabel}</span>) yazmayı unutma.
              </p>
            </div>
          )}

          {email && (
            <p className="text-xs text-slate-500 text-center leading-relaxed">
              {isBankTransfer ? "Sipariş ve ödeme bilgilerini" : "Sipariş bilgilerini"} <b className="text-slate-700">{email}</b> adresine de gönderdik.
            </p>
          )}

          {/* MİSAFİR — hesap aktivasyonu */}
          {isGuest ? (
            <div className="rounded-2xl border-2 border-olive-100 bg-olive-50/50 p-5 space-y-3">
              <p className="font-black text-slate-900">Siparişini takip etmek için hesabını aktifleştir</p>
              <p className="text-sm text-slate-600 leading-relaxed">
                Siparişinle birlikte bu e-postaya bir hesap açıldı. <b>E-postana gönderdiğimiz bağlantıdan şifreni belirlemen</b> yeterli.
              </p>
              <ul className="text-sm text-slate-600 space-y-1.5">
                {[
                  "Sipariş ve kargo takibi",
                  "İade / değişim talebi ve bizimle yazışma",
                  "Kayıtlı adresle hızlı alışveriş",
                  "Favoriler ve “stok gelince haber ver”",
                  "Satış ortaklığı ile YeriHisset Kredisi",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2"><CheckCircle2 size={15} className="text-olive-600 shrink-0 mt-0.5" /> {t}</li>
                ))}
              </ul>
              <div className="pt-1 text-xs text-slate-500">
                {activationState === "sent" ? (
                  <span className="text-green-700 font-bold">✓ Bağlantıyı tekrar gönderdik.</span>
                ) : activationState === "error" ? (
                  <span className="text-red-600 font-bold">Gönderilemedi, biraz sonra tekrar dene.</span>
                ) : (
                  <>E-posta gelmedi mi? (Spam klasörüne de bak){" "}
                    <button type="button" onClick={resendActivation} disabled={activationState === "sending"}
                      className="font-bold text-olive-700 underline disabled:opacity-50">
                      {activationState === "sending" ? "Gönderiliyor…" : "Tekrar gönder"}
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            {!isGuest && (
              <Link href="/account?tab=orders" className={cn(buttonVariants({ variant: "default" }), "h-12 rounded-2xl bg-olive-600 font-bold")}>
                Siparişlerimi Gör
              </Link>
            )}
            <Link href="/products" className={cn(buttonVariants({ variant: isGuest ? "default" : "ghost" }), "h-12 rounded-2xl font-bold", isGuest && "bg-olive-600")}>
              Alışverişe Devam Et
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    // Stok uyarısından sonra zaten Mağaza'ya gidiliyorsa Sepet'e çekme
    if (!leavingRef.current) router.push("/sepet");
    return null;
  }

  const totalPrice = getTotalPrice();
  const couponDiscount = couponData?.discount_amount ?? 0;
  const _selMethod = shippingMethods.find((m) => m.id === selectedShippingMethodId) || shippingMethods[0];
  const _selMethodSummary = _selMethod;
  const shippingCost = shipFee(_selMethod, totalPrice, !!couponData?.free_shipping);
  const preCreditTotal = Math.max(0, totalPrice + shippingCost - couponDiscount);
  const creditApplied = Math.min(Math.max(0, Number(creditInput) || 0), creditBalance, preCreditTotal);
  const finalTotal = Math.max(0, Math.round((preCreditTotal - creditApplied) * 100) / 100);

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

      {/* Stok uyarısı — sipariş sırasında ürün tükendi/azaldı */}
      {stockProblems && (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
                <PackageX size={24} className="text-amber-600" />
              </div>
              <h3 className="text-xl font-black text-slate-900">Üzgünüz, stok değişti</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">Sepetindeki bazı ürünler sen alışveriş yaparken tükendi ya da azaldı:</p>
            <ul className="space-y-2">
              {stockProblems.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 border border-slate-100 p-3 text-sm">
                  <span className="font-bold text-slate-800">{p.title}{p.variant ? <span className="text-olive-600"> · {p.variant}</span> : null}</span>
                  <span className={cn("shrink-0 text-xs font-black", p.live <= 0 ? "text-red-600" : "text-amber-700")}>
                    {p.live <= 0 ? "Tükendi — sepetten çıkarılacak" : `Stokta ${p.live} adet — adet ${p.live}'e inecek`}
                  </span>
                </li>
              ))}
            </ul>
            {(() => {
              const staying = items.filter((i) => !i.is_gift && !stockProblems.some((p) => p.id === i.id && p.live <= 0)).length;
              return (
                <Button onClick={resolveStockProblems} className="w-full h-12 rounded-2xl bg-olive-600 hover:bg-olive-700 font-black">
                  {staying > 0 ? "Tamam, sepetime dön" : "Tamam, mağazaya dön"}
                </Button>
              );
            })()}
          </div>
        </div>
      )}

      {/* Genel sipariş hatası (tarayıcı alert'i yerine) */}
      {orderError && (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 space-y-5 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
              <X size={26} className="text-red-500" />
            </div>
            <p className="text-sm font-bold text-slate-700 leading-relaxed">{orderError}</p>
            <Button onClick={() => setOrderError(null)} className="w-full h-12 rounded-2xl bg-olive-600 hover:bg-olive-700 font-black">Tamam</Button>
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-6xl mx-auto mb-8 md:mb-10">
          <CheckoutStepper current={step} onGoTeslimat={goToTeslimat} />
        </div>
        <div className="max-w-6xl mx-auto grid lg:grid-cols-12 gap-12">
          {/* MAIN FLOW */}
          <div className="lg:col-span-8 space-y-12">
            
            {step === "teslimat" && (<>
            {/* Step 0: Personal Info */}
            <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
               <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-olive-600 text-white rounded-2xl flex items-center justify-center font-black shadow-lg shadow-olive-100 italic">01</div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">İletişim Bilgileri</h3>
               </div>
               <div className="bento-card bg-white !p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] px-1">E-POSTA ADRESİ</label>
                      <div className="relative" id="f-email">
                        <Input
                          value={personalInfo.email}
                          disabled={!isGuest}
                          onChange={isGuest ? (e) => { setPersonalInfo({ ...personalInfo, email: e.target.value }); clearErr("email"); setEmailExists(false); } : undefined}
                          onBlur={isGuest ? checkGuestEmail : undefined}
                          placeholder={isGuest ? "ornek@eposta.com" : undefined}
                          type="email"
                          className={cn("h-14 rounded-2xl pl-4", isGuest ? "bg-white border-slate-200 font-bold focus:ring-olive-600" : "bg-slate-50 border-slate-100 font-bold opacity-60 cursor-not-allowed", errCls("email"))}
                        />
                        {!isGuest && <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400 uppercase">Sabit</div>}
                      </div>
                      {isGuest && emailExists && (
                        <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-4 space-y-2">
                          <p className="text-sm font-black text-red-700">Bu e-posta ile kayıtlı bir hesabın var.</p>
                          <p className="text-xs text-red-700/80 leading-relaxed">
                            Siparişin hesabına bağlansın diye lütfen giriş yap. Daha önce misafir olarak sipariş verdiysen ya da şifreni hatırlamıyorsan giriş ekranındaki “Şifremi unuttum” ile şifreni belirleyebilirsin.
                          </p>
                          <Link href="/login?redirect=/checkout" className="inline-flex h-10 px-5 items-center rounded-xl bg-olive-600 text-white text-xs font-black uppercase tracking-widest hover:bg-olive-700">
                            Giriş Yap
                          </Link>
                        </div>
                      )}
                      {isGuest && !emailExists && (
                        <p className="text-[10px] text-slate-400 font-medium px-1 leading-relaxed">
                          Üyeliğin var mı? <Link href="/login?redirect=/checkout" className="text-olive-600 font-bold">Giriş yap</Link> — kayıtlı adreslerinle daha hızlı.
                          <br />Siparişinle birlikte bu e-postaya bir YeriHisset hesabı açılır; şifreni sonra e-postadaki bağlantıdan belirleyip siparişini takip edebilirsin.
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2" id="f-firstName">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] px-1">ADINIZ</label>
                        <Input
                          value={personalInfo.firstName}
                          onChange={e => { setPersonalInfo({...personalInfo, firstName: e.target.value}); clearErr("firstName"); }}
                          placeholder="Ad"
                          className={cn("h-14 rounded-2xl bg-white border-slate-200 font-bold focus:ring-olive-600", errCls("firstName"))}
                        />
                      </div>
                      <div className="space-y-2" id="f-lastName">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] px-1">SOYADINIZ</label>
                        <Input
                          value={personalInfo.lastName}
                          onChange={e => { setPersonalInfo({...personalInfo, lastName: e.target.value}); clearErr("lastName"); }}
                          placeholder="Soyad"
                          className={cn("h-14 rounded-2xl bg-white border-slate-200 font-bold focus:ring-olive-600", errCls("lastName"))}
                        />
                      </div>
                    </div>

                  </div>
               </div>
            </section>

            {/* Step 1: Shipping Address */}
            <section id="f-shipping" className="space-y-6 animate-in fade-in slide-in-from-bottom-6">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-olive-600 text-white rounded-2xl flex items-center justify-center font-black shadow-lg shadow-olive-100 italic">02</div>
                    <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Teslimat Adresi</h3>
                  </div>
                  {!isGuest && (
                    <Link href="/account?tab=addresses&returnTo=/checkout" className="text-olive-600 font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:translate-x-1 transition-transform">
                      <Plus size={16} /> ADRES EKLE
                    </Link>
                  )}
               </div>

               {errors.shipping && (
                 <p className="text-sm text-red-500 font-bold px-1">⚠ Lütfen bir teslimat adresi seçin (veya yeni adres ekleyin).</p>
               )}

               {isGuest ? (
                 <div className="bento-card bg-white !p-6 md:!p-8 space-y-5">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="space-y-2" id="f-phone">
                       <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] px-1">TELEFON</label>
                       <Input
                         type="tel" inputMode="numeric"
                         value={guestAddr.phone}
                         onChange={(e) => { setGuestAddr({ ...guestAddr, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }); clearErr("phone"); }}
                         placeholder="5XX XXX XX XX"
                         className={cn("h-12 rounded-2xl bg-white border-slate-200 font-bold tracking-wide", errCls("phone"))}
                       />
                     </div>
                     <div className="space-y-2" id="f-city">
                       <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] px-1">ŞEHİR (İL)</label>
                       <div className={cn("rounded-2xl", errors.city && "ring-2 ring-red-200")}>
                         <GeoSelect options={CITIES} value={guestAddr.city} onChange={(city) => { setGuestAddr({ ...guestAddr, city, district: "" }); clearErr("city"); }} placeholder="İl seçiniz..." />
                       </div>
                     </div>
                     <div className="space-y-2" id="f-district">
                       <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] px-1">İLÇE</label>
                       <div className={cn("rounded-2xl", errors.district && "ring-2 ring-red-200")}>
                         <GeoSelect options={guestAddr.city ? (DISTRICTS[guestAddr.city] ?? []) : []} value={guestAddr.district} onChange={(district) => { setGuestAddr({ ...guestAddr, district }); clearErr("district"); }} placeholder={guestAddr.city ? "İlçe seçiniz..." : "Önce il seçin"} disabled={!guestAddr.city} />
                       </div>
                     </div>
                   </div>
                   <div className="space-y-2" id="f-address">
                     <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] px-1">AÇIK ADRES</label>
                     <textarea
                       value={guestAddr.addressDetail}
                       onChange={(e) => { setGuestAddr({ ...guestAddr, addressDetail: e.target.value }); clearErr("address"); }}
                       placeholder="Mahalle, sokak, bina ve daire bilgileri..."
                       className={cn("flex min-h-[90px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-olive-600 placeholder:text-slate-400", errCls("address"))}
                     />
                   </div>
                 </div>
               ) : addresses.length === 0 ? (
                 <div 
                  className="bento-card border-2 border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center py-16 gap-4 group cursor-pointer" 
                  onClick={() => router.push("/account?tab=addresses&returnTo=/checkout")}
                 >
                    <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-slate-300 group-hover:text-olive-600 transition-colors shadow-sm">
                      <MapPin size={32} />
                    </div>
                    <p className="text-sm font-bold text-slate-500 text-center leading-relaxed italic">
                      Henüz kayıtlı adresiniz bulunmuyor. <br/> 
                      <span className="text-olive-600 not-italic uppercase font-black tracking-widest text-xs">YENİ ADRES EKLEMEK İÇİN TIKLAYIN</span>
                    </p>
                 </div>
               ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   {addresses.map((addr) => (
                     <div 
                      key={addr.id}
                      onClick={() => { setSelectedShippingId(addr.id); clearErr("shipping"); }}
                      className={cn(
                        "bento-card !p-6 cursor-pointer relative transition-all duration-300",
                        selectedShippingId === addr.id 
                          ? "border-olive-600 bg-olive-50/30 group ring-4 ring-olive-50" 
                          : "bg-white hover:border-slate-300"
                      )}
                     >
                        <div className="flex justify-between items-start mb-4">
                           <span className={cn(
                             "text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full",
                             selectedShippingId === addr.id ? "bg-olive-600 text-white" : "bg-slate-100 text-slate-500"
                           )}>
                             {addr.address_name}
                           </span>
                           {selectedShippingId === addr.id && (
                             <div className="w-6 h-6 bg-olive-600 text-white rounded-full flex items-center justify-center shadow-lg animate-in zoom-in">
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

            {/* Kargo yöntemi — teslimat adresinden sonra, kendi kutusunda */}
            <section className="space-y-6 animate-in fade-in slide-in-from-bottom-8">
               <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-olive-600 text-white rounded-2xl flex items-center justify-center font-black shadow-lg shadow-olive-100 italic">03</div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Kargo Yöntemi</h3>
               </div>
               <div className="bento-card bg-white !p-6 space-y-3">
                 {shippingMethods.length === 0 ? (
                   <p className="text-sm text-slate-400">
                     {shippingLoaded ? "Kargo seçenekleri şu an yüklenemedi. Sayfayı yenileyip tekrar dene." : "Kargo seçenekleri yükleniyor…"}
                   </p>
                 ) : shippingMethods.map((m) => {
                   const fee = shipFee(m, totalPrice, !!couponData?.free_shipping);
                   const active = (selectedShippingMethodId || shippingMethods[0]?.id) === m.id;
                   const rest = !couponData?.free_shipping && m.free_over != null && Number(m.fee || 0) > 0 && totalPrice < Number(m.free_over)
                     ? Number(m.free_over) - totalPrice : null;
                   return (
                     <button
                       key={m.id}
                       type="button"
                       onClick={() => { setSelectedShippingMethodId(m.id); useCartStore.getState().setShippingMethodId(m.id); }}
                       className={cn(
                         "w-full flex items-center justify-between gap-4 rounded-2xl border-2 px-5 py-4 text-left transition-all",
                         active ? "border-olive-600 bg-olive-50/40 ring-4 ring-olive-50" : "border-slate-100 hover:border-slate-200"
                       )}
                     >
                       <span className="flex items-center gap-3 min-w-0">
                         <span className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0", active ? "border-olive-600" : "border-slate-300")}>
                           {active && <span className="w-2.5 h-2.5 rounded-full bg-olive-600" />}
                         </span>
                         <span className="min-w-0">
                           <span className="block text-sm font-black text-slate-900">{m.name}</span>
                           {m.description && <span className="block text-xs text-slate-500 font-medium">{m.description}</span>}
                           {rest !== null && (
                             <span className="block text-[11px] font-bold text-olive-700 mt-0.5">₺{rest.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} daha ekle, ücretsiz olsun</span>
                           )}
                         </span>
                       </span>
                       <span className={cn("text-base font-black shrink-0", fee === 0 ? "text-green-600" : "text-slate-900")}>
                         {fee === 0 ? "ÜCRETSİZ" : `₺${fee.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}`}
                       </span>
                     </button>
                   );
                 })}
               </div>
            </section>

            {/* Step 2: Billing Address — misafirde gizli (fatura = teslimat) */}
            {!isGuest && (
            <section className="space-y-6 animate-in fade-in slide-in-from-bottom-8">
               <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-olive-600 text-white rounded-2xl flex items-center justify-center font-black shadow-lg shadow-olive-100 italic">04</div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Fatura Bilgileri</h3>
               </div>
               
               <div className="bento-card bg-white !p-0 overflow-hidden">
                  <div 
                    className="p-8 flex items-center gap-4 cursor-pointer select-none bg-olive-50/30 border-b border-olive-100 transition-colors hover:bg-olive-50/50"
                    onClick={() => setIsSameAsShipping(!isSameAsShipping)}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all shadow-sm",
                      isSameAsShipping ? "bg-olive-600 border-olive-600 text-white" : "bg-white border-slate-200"
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
                            selectedBillingId === addr.id ? "border-olive-600 bg-olive-50/30 ring-4 ring-olive-50" : "bg-white"
                          )}
                         >
                            <div className="flex justify-between items-start mb-4">
                               <span className="text-[9px] font-black uppercase tracking-[0.2em] bg-slate-100 text-slate-500 px-3 py-1 rounded-full">{addr.address_name}</span>
                               {selectedBillingId === addr.id && <CheckCircle2 size={18} className="text-olive-600 animate-in zoom-in" />}
                            </div>
                            <p className="font-black text-slate-900 text-md italic uppercase">{addr.first_name} {addr.last_name}</p>
                            {addr.is_corporate && (
                              <p className="text-[11px] text-blue-700 font-bold mt-1 line-clamp-1">🏢 {addr.company_name} · VKN {addr.tax_number}</p>
                            )}
                            <p className="text-xs text-slate-500 mt-2 font-medium line-clamp-1">{addr.address_detail}</p>
                         </div>
                       ))}
                    </div>
                  )}
               </div>
            </section>
            )}

            </>)}

            {step === "odeme" && (<>
            {/* Teslimat özeti — değiştirmek için teslimat adımına dön */}
            <section className="space-y-4 animate-in fade-in">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-olive-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-olive-100"><Truck size={18} /></div>
                    <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Teslimat</h3>
                  </div>
                  <button type="button" onClick={goToTeslimat} className="text-olive-600 font-black text-xs uppercase tracking-widest hover:underline">Düzenle</button>
               </div>
               {(() => {
                 const addr = isGuest ? null : addresses.find((a) => a.id === selectedShippingId);
                 const bill = !isGuest && !isSameAsShipping ? addresses.find((a) => a.id === selectedBillingId) : null;
                 return (
                   <div className="bento-card bg-white !p-6 grid grid-cols-1 md:grid-cols-3 gap-5 text-sm">
                     <div>
                       <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">İletişim</p>
                       <p className="font-bold text-slate-900">{personalInfo.firstName} {personalInfo.lastName}</p>
                       <p className="text-slate-500 break-all">{personalInfo.email}</p>
                       {isGuest && guestAddr.phone && <p className="text-slate-500">{guestAddr.phone}</p>}
                     </div>
                     <div>
                       <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Adres</p>
                       {isGuest ? (
                         <p className="text-slate-700">{guestAddr.addressDetail}<br /><b>{guestAddr.district} / {guestAddr.city}</b></p>
                       ) : addr ? (
                         <p className="text-slate-700">{addr.address_detail}<br /><b>{addr.district} / {addr.city}</b></p>
                       ) : <p className="text-slate-400">—</p>}
                       <p className="text-xs text-slate-400 mt-1">Fatura: {isGuest || isSameAsShipping ? "teslimat adresiyle aynı" : (bill?.is_corporate ? `${bill.company_name}` : bill?.address_name || "—")}</p>
                     </div>
                     <div>
                       <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Kargo</p>
                       <p className="font-bold text-slate-900">{_selMethodSummary?.name || "Kargo"}</p>
                       <p className={cn("font-bold", shippingCost === 0 ? "text-green-600" : "text-slate-700")}>
                         {shippingCost === 0 ? "Ücretsiz" : `₺${shippingCost.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}`}
                       </p>
                     </div>
                   </div>
                 );
               })()}
            </section>

            {creditBalance > 0 && (
            <section className="space-y-4">
               <div className="bento-card bg-white !p-6">
                    {/* YeriHisset Kredisi (cüzdan) — bakiyesi olan kullanıcıya */}
                    {(
                      <div className="space-y-2 rounded-2xl border-2 border-emerald-100 bg-emerald-50/40 p-4">
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-600 flex items-center gap-1.5">
                          <Banknote size={12} /> YERİHİSSET KREDİSİ · BAKİYE ₺{creditBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </p>
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={creditInput}
                            onChange={(e) => {
                              const v = e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".");
                              setCreditInput(v);
                            }}
                            placeholder="Kullanılacak tutar (₺)"
                            className="h-10 rounded-xl font-bold text-sm"
                          />
                          <Button
                            type="button" variant="outline" size="sm"
                            className="h-10 px-4 font-bold shrink-0 rounded-xl border-emerald-200 text-emerald-700"
                            onClick={() => setCreditInput(String(Math.min(creditBalance, preCreditTotal)))}
                          >
                            Tümü
                          </Button>
                        </div>
                        {creditApplied > 0 ? (
                          <p className="text-[11px] text-emerald-700 font-bold">
                            ₺{creditApplied.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} uygulandı ·{" "}
                            <button type="button" onClick={() => setCreditInput("")} className="underline hover:text-red-500">Kaldır</button>
                          </p>
                        ) : (
                          <p className="text-[11px] text-emerald-600/80">Bakiyenin tamamını veya bir kısmını bu siparişte indirim olarak kullanabilirsin.</p>
                        )}
                      </div>
                    )}
               </div>
            </section>
            )}

            {/* Step 3: Payment */}
            <section className="space-y-6 animate-in fade-in slide-in-from-bottom-10">
               <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-olive-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-olive-100"><CreditCard size={18} /></div>
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
                       paymentMethod === "credit_card" ? "bg-white/10 text-olive-400" : "bg-slate-100 text-slate-500"
                     )}>
                        <CreditCard size={40} />
                     </div>
                     <div className="text-center space-y-2">
                        <p className={cn("font-black text-xl uppercase italic tracking-tight", paymentMethod === "credit_card" ? "text-white" : "text-slate-800")}>Kredi / Banka Kartı</p>
                        <p className={cn("text-[10px] font-bold uppercase tracking-widest", paymentMethod === "credit_card" ? "text-slate-400" : "text-slate-400")}>iyzico Güvencesiyle Ödeyin</p>
                     </div>
                     {paymentMethod === "credit_card" && (
                       <div className="w-6 h-6 bg-olive-600 text-white rounded-full flex items-center justify-center shadow-lg animate-in zoom-in absolute top-4 right-4">
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


               {paymentMethod === "credit_card" && (
                 <div className="bento-card bg-white !p-6 animate-in fade-in slide-in-from-top-4">
                    {/* TC Kimlik — iyzico + yasal zorunluluk */}
                   <div className="space-y-2" id="f-tckn">
                     <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] px-1 flex items-center gap-1.5">
                       <IdCard size={12} /> TC KİMLİK NUMARASI
                     </label>
                     <Input
                       value={identityNumber}
                       onChange={e => { setIdentityNumber(e.target.value.replace(/\D/g, "").slice(0, 11)); clearErr("tckn"); }}
                       placeholder="Örn: 12345678901"
                       maxLength={11}
                       className={cn("h-14 rounded-2xl bg-white border-slate-200 font-bold font-mono tracking-widest focus:ring-olive-600", errCls("tckn"))}
                     />
                     <p className="text-[10px] text-slate-400 font-medium px-1 leading-relaxed">
                       <span className="text-olive-600 font-bold">Yasal zorunluluk:</span> iyzico, 6493 sayılı Ödeme Hizmetleri Kanunu gereğince kimlik doğrulaması yapmaktadır. Bilgileriniz yalnızca fatura ve ödeme işlemleri için kullanılır.
                     </p>
                   </div>
                 </div>
               )}

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
            </>)}
          </div>

          {/* SIDEBAR SUMMARY */}
          <div className="lg:col-span-4 relative">
            <div className="sticky top-32 space-y-8 animate-in fade-in slide-in-from-right duration-1000">
               <div className="bento-card !p-0 bg-white shadow-2xl shadow-slate-200/50">
                  <div className="bg-slate-900 p-8 text-white relative overflow-hidden">
                     <div className="absolute top-0 right-0 w-32 h-32 bg-olive-600 blur-[80px] opacity-30 -mr-16 -mt-16" />
                     <h2 className="text-2xl font-black uppercase tracking-tighter italic relative z-10">Sipariş Özeti</h2>
                     <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] relative z-10 mt-1">{step === "odeme" ? "Ödeme öncesi son kontrol" : "Teslimat bilgilerini tamamla"}</p>
                  </div>
                  
                  <div className="p-8 space-y-8">
                    {/* Item Thumbnails (Juicy version) */}
                    <div className="flex -space-x-5 overflow-hidden py-2">
                      {items.slice(0, 5).map((item, idx) => (
                        <div key={idx} className="inline-block h-16 w-16 rounded-2xl ring-4 ring-white shadow-xl overflow-hidden bg-slate-100 transform hover:-translate-y-2 transition-transform duration-500">
                          <Image src={item.image} alt="" width={64} height={64} className="h-full w-full object-cover" />
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
                        <span className="flex flex-col">
                          <span>Kargo Ücreti</span>
                          {_selMethodSummary?.name && <span className="text-[10px] font-medium normal-case not-italic tracking-normal text-slate-400">{_selMethodSummary.name}</span>}
                        </span>
                        <span className={cn(shippingCost === 0 ? "text-green-600" : "text-slate-900", "text-lg")}>
                          {shippingCost === 0 ? "ÜCRETSİZ" : `₺${shippingCost.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}`}
                        </span>
                      </div>
                      {couponData && (
                        <div className="flex justify-between text-green-600 text-sm">
                          <span className="flex flex-col">
                            <span>Kupon İndirimi</span>
                            <span className="text-[10px] font-medium normal-case not-italic tracking-normal text-slate-400">
                              {couponCode} · <Link href="/sepet" className="underline hover:text-olive-600">Sepette değiştir</Link>
                            </span>
                          </span>
                          <span className="text-lg">{couponData.free_shipping && couponDiscount === 0 ? "Ücretsiz kargo" : `-₺${couponDiscount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`}</span>
                        </div>
                      )}
                      {creditApplied > 0 && (
                        <div className="flex justify-between text-emerald-600 text-sm">
                          <span>YeriHisset Kredisi</span>
                          <span className="text-lg">-₺{creditApplied.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                    </div>

                    {/* Kupon — yalnız sepette girilir; burada salt okunur */}
                    {couponError && storeCouponCode && !couponData && (
                      <p className="text-xs font-bold text-amber-700 bg-amber-50 rounded-xl px-3 py-2">
                        Sepetteki kupon ({storeCouponCode}) uygulanamadı: {couponError} · <Link href="/sepet" className="underline">Sepette değiştir</Link>
                      </p>
                    )}
                    <Separator className="bg-slate-100" />

                    <div className="flex flex-col gap-1 p-6 bg-olive-50/50 rounded-3xl border-2 border-olive-100 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-16 h-16 bg-olive-100 blur-3xl opacity-50 group-hover:scale-150 transition-transform duration-1000" />
                      <span className="text-[9px] font-black text-olive-400 uppercase tracking-widest leading-none">Ödenecek Tutar</span>
                      <span className="text-4xl font-black text-olive-600 italic tracking-tighter pt-1">
                        ₺{finalTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[11px] font-bold text-olive-600/70 tracking-tight">KDV Dahil</span>
                    </div>

                    {step === "teslimat" ? (
                    <Button
                      onClick={goToOdeme}
                      className="w-full h-16 rounded-[2rem] bg-olive-600 hover:bg-olive-700 text-lg font-black shadow-2xl shadow-olive-100 uppercase tracking-tighter group mt-2 transition-all active:scale-95"
                    >
                      Ödeme adımına geç <ArrowRight size={22} className="ml-2 group-hover:translate-x-2 transition-transform" />
                    </Button>
                    ) : (<>
                    <Button
                      onClick={handlePlaceOrder}
                      disabled={placing}
                      className="w-full h-20 rounded-[2rem] bg-olive-600 hover:bg-olive-700 text-xl font-black shadow-2xl shadow-olive-100 uppercase tracking-tighter group mt-2 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {placing ? (paymentMethod === "credit_card" ? "Ödemeye yönlendiriliyor…" : "Sipariş işleniyor…") : <>SİPARİŞİ TAMAMLA <ArrowRight size={24} className="ml-2 group-hover:translate-x-3 transition-transform duration-500" /></>}
                    </Button>
                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed text-center px-2 -mt-1">
                      “Siparişi Tamamla” butonuna basarak <Link href="/mesafeli-satis" target="_blank" className="font-bold text-olive-600 underline">Mesafeli Satış Sözleşmesi</Link>’ni ve Ön Bilgilendirme Formu’nu kabul etmiş sayılırsınız.
                    </p>
                    </>)}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-3 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 p-3 rounded-2xl">
                        <ShieldCheck size={16} className="text-green-500" />
                        <span>Güvenli <br/> Ödeme</span>
                      </div>
                      <div className="flex items-center gap-3 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 p-3 rounded-2xl">
                        <Truck size={16} className="text-olive-600" />
                        <span>Ücretsiz <br/> Sigorta</span>
                      </div>
                    </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
