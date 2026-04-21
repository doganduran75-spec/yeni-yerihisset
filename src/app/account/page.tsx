"use client";

import { useEffect, useState, Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  User,
  Package,
  MapPin,
  ShieldCheck,
  LogOut,
  ChevronRight,
  Plus,
  Trash2,
  CheckCircle2,
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
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type TabType = "orders" | "addresses" | "profile" | "security" | "affiliate" | "coupons" | "messages";

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center animate-pulse text-olive-600 font-bold">Yükleniyor...</div>}>
      <AccountPageInner />
    </Suspense>
  );
}

function AccountPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabType) || "orders";
  
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
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

  useEffect(() => {
    fetchUserData();
  }, []);

  useEffect(() => {
    if (activeTab === "affiliate" && !affiliate && !affiliateLoading) {
      fetchAffiliateData();
    }
    if (activeTab === "coupons") {
      fetchUserCoupons();
    }
    if (activeTab === "messages") {
      fetchMessages();
    }
  }, [activeTab]);

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

    const [prof, ords, addrs] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('orders').select('*, order_items(*, products(title, image_url, images))').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('user_addresses').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    ]);

    setProfile(prof.data);
    setOrders(ords.data || []);
    setAddresses(addrs.data || []);
    setLoading(false);
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

  async function handleAddAddress(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    // If setting as default, we might want to unset others first or let DB handle it?
    // Let's keep it simple for now as the user requested basic functionality.

    const { error } = await supabase.from('user_addresses').insert({
      ...addressForm,
      user_id: user.id
    });

    if (error) alert("Hata: " + error.message);
    else {
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
      });
      fetchUserData();
    }
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
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Navigation Sidebar */}
          <aside className="lg:col-span-1 space-y-4">
            <div className="bg-white p-6 rounded-3xl border shadow-sm space-y-4">
               <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-olive-100 rounded-full flex items-center justify-center text-olive-600">
                    <User size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 leading-none">{profile?.first_name} {profile?.last_name}</h3>
                    <p className="text-xs font-medium text-slate-400 mt-1">{user?.email}</p>
                  </div>
               </div>
               
               <nav className="space-y-1">
                  {[
                    { id: "orders", icon: Package, label: "Siparişlerim" },
                    { id: "messages", icon: MessageSquare, label: "Mesajlarım" },
                    { id: "coupons", icon: Ticket, label: "Kuponlarım" },
                    { id: "addresses", icon: MapPin, label: "Adres Bilgilerim" },
                    { id: "profile", icon: User, label: "Profil Bilgilerim" },
                    { id: "security", icon: ShieldCheck, label: "Güvenlik Ayarları" },
                    { id: "affiliate", icon: Link2, label: "Affiliate" },
                  ].map((tab) => (
                    <button 
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as TabType)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all",
                        activeTab === tab.id ? "bg-olive-600 text-white shadow-lg shadow-olive-100" : "text-slate-500 hover:bg-slate-50"
                      )}
                    >
                      <tab.icon size={18} /> {tab.label}
                    </button>
                  ))}
               </nav>
            </div>
          </aside>

          {/* Tab Content Area */}
          <div className="lg:col-span-3 space-y-6">

            {/* ── Mesajlaşma ── */}
            {activeTab === "messages" && (
              <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2 h-[calc(100vh-200px)] flex flex-col">
                <div className="flex items-center justify-between shrink-0">
                  <h2 className="text-2xl font-black text-slate-900">Mesajlarım</h2>
                  <Badge variant="outline" className="text-slate-500">Müşteri Destek</Badge>
                </div>

                <Card className="flex-1 flex flex-col border-none shadow-sm overflow-hidden min-h-0 bg-white rounded-3xl">
                  {/* Chat Messages */}
                  <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                    {messagesLoading ? (
                      <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-olive-600" /></div>
                    ) : messages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8">
                        <div className="w-16 h-16 bg-olive-50 rounded-full flex items-center justify-center text-olive-400">
                          <MessageSquare size={28} />
                        </div>
                        <p className="text-sm font-medium text-slate-400 max-w-[200px]">Destek ekibimize ilk mesajınızı hemen gönderin.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {messages.map((msg) => (
                          <div key={msg.id} className={cn(
                            "flex flex-col max-w-[80%]",
                            msg.sender_role === "user" ? "ml-auto items-end" : "mr-auto items-start"
                          )}>
                            <div className={cn(
                              "px-4 py-2.5 rounded-2xl text-sm font-medium leading-relaxed",
                              msg.sender_role === "user" 
                                ? "bg-olive-600 text-white rounded-tr-none" 
                                : "bg-slate-100 text-slate-900 rounded-tl-none"
                            )}>
                              {msg.content}
                            </div>
                            <span className="text-[10px] text-slate-400 mt-1 px-1">
                              {new Date(msg.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Input Area */}
                  <div className="p-4 border-t bg-slate-50/50 shrink-0">
                    <form onSubmit={handleSendMessage} className="flex gap-2 relative">
                      <Input 
                        placeholder="Mesajınızı yazın..." 
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        className="h-12 pr-12 rounded-2xl border-slate-200 focus:ring-olive-600 bg-white"
                        disabled={sendingMessage}
                      />
                      <Button 
                        type="submit" 
                        size="icon" 
                        disabled={!newMessage.trim() || sendingMessage}
                        className="absolute right-1 top-1 h-10 w-10 bg-olive-600 hover:bg-olive-700 rounded-xl transition-all active:scale-90"
                      >
                        {sendingMessage ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      </Button>
                    </form>
                  </div>
                </Card>
              </section>
            )}

            {/* ── Kuponlarım ── */}
            {activeTab === "coupons" && (
              <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-black text-slate-900">Kuponlarım</h2>
                  <Button
                    onClick={() => setShowClaimInput((p) => !p)}
                    variant="outline"
                    className="gap-2 font-bold"
                  >
                    <Plus size={16} /> Kod Ekle
                  </Button>
                </div>

                {/* Kod ekleme formu */}
                {showClaimInput && (
                  <div className="bg-olive-50 border border-blue-200 rounded-2xl p-5 animate-in fade-in slide-in-from-top-2">
                    <p className="text-sm font-bold text-olive-800 mb-3">Kupon kodunuzu girin</p>
                    <form onSubmit={handleClaimCoupon} className="flex gap-2">
                      <Input
                        value={claimCode}
                        onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
                        placeholder="ÖRNEK: INDIRIM10"
                        className="font-mono font-bold tracking-widest max-w-xs"
                        autoFocus
                      />
                      <Button type="submit" disabled={claimLoading || !claimCode.trim()} className="bg-olive-600 gap-2">
                        {claimLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                        Ekle
                      </Button>
                    </form>
                  </div>
                )}

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
                            expired || used ? "opacity-50 grayscale" : soonExpiry ? "border-amber-300 bg-amber-50/30" : "border-slate-200 bg-white hover:border-blue-200 hover:shadow-sm"
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
                              <span className="font-mono font-black text-olive-700 bg-olive-50 px-3 py-1 rounded-lg text-sm tracking-widest border border-blue-100">
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
              </section>
            )}

            {activeTab === "orders" && (
              <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center justify-between">
                   <h2 className="text-2xl font-black text-slate-900">Siparişlerim</h2>
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
                                <p className="text-sm font-medium text-slate-500">#{order.id.slice(0,8)}</p>
                              </div>
                           </div>
                           <div className="flex items-center gap-2">
                              {order.status === 'completed' ? (
                                <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none font-bold py-1 px-3 flex gap-2">
                                  <CheckCircle2 size={14} /> Teslim Edildi
                                </Badge>
                              ) : (
                                <Badge className="bg-olive-50 text-olive-600 hover:bg-olive-50 border-blue-100 font-bold py-1 px-3 flex gap-2">
                                  <Clock size={14} /> {order.status === 'processing' ? 'Hazırlanıyor' : order.status === 'shipped' ? 'Kargoya Verildi' : 'Onay Bekliyor'}
                                </Badge>
                              )}
                              <Button variant="ghost" size="sm" className="font-bold text-xs underline">Detaylar</Button>
                           </div>
                        </div>
                        <CardContent className="p-4 md:p-6">
                           <div className="flex flex-col gap-4">
                              {order.order_items?.map((item: any, idx: number) => (
                                <div key={idx} className="flex gap-4 items-center">
                                   <div className="w-16 h-16 bg-slate-100 rounded-xl overflow-hidden shrink-0">
                                      <img 
                                        src={item.products?.images?.[0] || item.products?.image_url || "/placeholder.png"} 
                                        alt={item.products?.title}
                                        className="w-full h-full object-cover"
                                      />
                                   </div>
                                   <div className="flex-1">
                                      <h4 className="text-sm font-bold text-slate-900">{item.products?.title}</h4>
                                      <p className="text-xs text-slate-400 mt-1">{item.quantity} Adet x ₺{item.unit_price.toLocaleString('tr-TR')}</p>
                                   </div>
                                </div>
                              ))}
                           </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTab === "addresses" && (
              <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center justify-between">
                   <h2 className="text-2xl font-black text-slate-900">Adres Bilgilerim</h2>
                   {!showAddressForm && (
                     <Button 
                      onClick={() => setShowAddressForm(true)}
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
                             <Input required value={addressForm.phone} onChange={e => setAddressForm({...addressForm, phone: e.target.value})} placeholder="05XX XXX XX XX" className="h-12" />
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
                            <Input required value={addressForm.city} onChange={e => setAddressForm({...addressForm, city: e.target.value})} placeholder="İstanbul" className="h-12" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-slate-500 px-1">İlçe</label>
                            <Input required value={addressForm.district} onChange={e => setAddressForm({...addressForm, district: e.target.value})} placeholder="Kadıköy" className="h-12" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase text-slate-500 px-1">Açık Adres</label>
                          <textarea 
                            required
                            className="flex min-h-[100px] w-full rounded-2xl border border-input bg-slate-50/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-olive-600 transition-all font-medium"
                            value={addressForm.address_detail || ""}
                            onChange={e => setAddressForm({...addressForm, address_detail: e.target.value})}
                            placeholder="Mahalle, sokak, bina ve daire bilgileri..."
                          />
                        </div>

                        <div className="flex flex-col gap-3 p-4 bg-slate-50 rounded-2xl border-2 border-slate-100">
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
                          </div>
                       </CardContent>
                    </Card>
                  ))}
                  {addresses.length === 0 && !showAddressForm && (
                     <div 
                      onClick={() => setShowAddressForm(true)}
                      className="border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center py-12 gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
                     >
                        <Plus className="text-slate-300" size={32} />
                        <span className="text-sm font-bold text-slate-400 tracking-tight">Kayıtlı adresiniz yok. Eklemek için tıklayın.</span>
                     </div>
                  )}
                </div>
              </section>
            )}

            {activeTab === "profile" && (
              <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                <h2 className="text-2xl font-black text-slate-900">Profil Bilgilerim</h2>
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
                               <label className="text-xs font-bold uppercase text-slate-500 px-1">Telefon Numarası</label>
                               <Input value={profile?.phone || ""} onChange={e => setProfile({...profile, phone: e.target.value})} placeholder="05XX XXX XX XX" className="h-12 font-bold" />
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
              </section>
            )}

            {activeTab === "affiliate" && (
              <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-black text-slate-900">Affiliate Programı</h2>
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
                    <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-8 text-white">
                      <h3 className="text-2xl font-black mb-2">Affiliate Ol, Kazan</h3>
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
                        <div className="bg-olive-50 rounded-2xl p-4 border border-blue-100 text-sm text-olive-700 font-medium">
                          Başvurunuz anında onaylanır ve affiliate linkinizi hemen kullanabilirsiniz.
                        </div>
                        <Button
                          type="submit"
                          disabled={affiliateApplying}
                          className="w-full h-14 rounded-2xl bg-olive-600 font-black text-lg shadow-lg shadow-olive-100"
                        >
                          {affiliateApplying ? "Başvuruluyor..." : "Affiliate Olmak İstiyorum"}
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
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Affiliate Kodunuz</p>
                        <div className="flex items-center gap-4">
                          <span className="text-3xl font-black tracking-tight font-mono">{affiliate.code}</span>
                          <button
                            onClick={() => copyAffiliateCode(affiliate.code)}
                            className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                          >
                            <Copy size={14} />
                            {affiliateCopied ? "Kopyalandı!" : "Ana Sayfa Linkini Kopyala"}
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
              </section>
            )}

            {activeTab === "security" && (
              <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                <h2 className="text-2xl font-black text-slate-900">Güvenlik Ayarları</h2>
                <Card className="border-none shadow-sm">
                   <CardContent className="p-8 space-y-8">
                      <div className="flex items-center gap-6 p-6 bg-olive-50 rounded-3xl border-2 border-blue-100 border-dashed">
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
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
