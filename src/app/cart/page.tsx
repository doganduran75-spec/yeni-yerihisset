"use client";

import { useCartStore } from "@/store/useCartStore";
import Link from "next/link";
import { 
  ShoppingBag, 
  Trash2, 
  Plus, 
  Minus, 
  ArrowLeft, 
  ChevronRight, 
  ShieldCheck,
  CreditCard,
  Truck,
  User
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export default function CartPage() {
  const { items, removeItem, updateQuantity, getTotalPrice, clearCart } = useCartStore();
  const [mounted, setMounted] = useState(false);

  // Fix hydration issues with zustand persist
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <ShoppingBag className="text-slate-200" size={48} />
          <div className="h-4 w-32 bg-slate-200 rounded" />
        </div>
      </div>
    );
  }

  const totalPrice = getTotalPrice();
  const shippingCost = totalPrice > 500 ? 0 : 29.90;

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-white">
        <header className="border-b">
          <div className="container mx-auto px-4 h-16 flex items-center">
            <Link href="/" className="text-xl font-black tracking-tighter text-blue-600">
              Yeri<span className="text-slate-900">Hisset</span>
            </Link>
          </div>
        </header>
        <main className="container mx-auto px-4 py-20 text-center space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto ring-8 ring-slate-50/50">
            <ShoppingBag className="text-slate-300" size={40} />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-black text-slate-900">Sepetiniz Boş</h1>
            <p className="text-slate-500 max-w-sm mx-auto">
              Görünüşe göre henüz sepetinize bir ürün eklememişsiniz. Harika ürünlerimizi keşfetmeye ne dersiniz?
            </p>
          </div>
          <Link href="/" className={cn(buttonVariants({ size: "lg" }), "h-14 px-10 rounded-2xl bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-100 font-bold")}>
            Alışverişe Başla
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafbfc]">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-black tracking-tighter text-blue-600 group flex items-center gap-2">
             <ArrowLeft size={18} className="text-slate-400 group-hover:-translate-x-1 transition-transform" />
             Yeri<span className="text-slate-900">Hisset</span>
          </Link>
          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-sm font-bold text-slate-500">
              SEPETİM ({items.length})
            </div>
            <Link 
              href="/account"
              className="flex items-center gap-2 p-2 hover:bg-slate-100 rounded-full transition-colors group"
              title="Hesabım"
            >
              <User size={20} className="text-slate-700 group-hover:text-blue-600 transition-colors" />
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 md:py-12">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Cart Items List */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-black text-slate-900">Alışveriş Sepeti</h1>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearCart}
                className="text-red-500 hover:text-red-700 hover:bg-red-50 font-bold"
              >
                TÜMÜNÜ SİL
              </Button>
            </div>

            <div className="space-y-4">
              {items.map((item) => (
                <Card key={item.id} className="border-none shadow-sm overflow-hidden group hover:shadow-md transition-shadow">
                  <CardContent className="p-4 md:p-6">
                    <div className="flex gap-4 md:gap-6">
                      <div className="w-24 h-32 md:w-32 md:h-40 bg-slate-50 rounded-2xl overflow-hidden shrink-0 border border-slate-100">
                        <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 flex flex-col justify-between py-1">
                        <div className="space-y-1">
                          <div className="flex justify-between items-start gap-4">
                            <h3 className="font-bold text-slate-900 md:text-lg line-clamp-1">{item.title}</h3>
                            <button 
                              onClick={() => removeItem(item.id)}
                              className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                          {item.variant_name && (
                            <p className="text-sm font-bold text-blue-600 uppercase tracking-widest">{item.variant_name}</p>
                          )}
                        </div>

                        <div className="flex items-end justify-between">
                          <div className="flex items-center gap-1 border-2 border-slate-100 rounded-xl p-0.5 bg-slate-50">
                            <button 
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              className="p-2 hover:bg-white rounded-lg transition-colors"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="w-8 text-center font-bold text-sm">{item.quantity}</span>
                            <button 
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              className="p-2 hover:bg-white rounded-lg transition-colors"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                          <div className="text-right">
                             <p className="text-lg font-black text-slate-900">₺{(item.price * item.quantity).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
                             <p className="text-[10px] text-slate-400 font-bold">BİRİM: ₺{item.price.toLocaleString('tr-TR')}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:gap-3 transition-all pt-4">
              <ArrowLeft size={16} /> Alışverişe Devam Et
            </Link>
          </div>

          {/* Order Summary */}
          <div className="space-y-6">
            <Card className="border-none shadow-lg shadow-blue-900/5 bg-white rounded-3xl overflow-hidden">
               <div className="bg-blue-600 p-6 text-white">
                  <h2 className="text-xl font-black">Ödeme Özeti</h2>
                  <p className="text-blue-100 text-xs font-bold uppercase tracking-widest">Sipariş Onayı Öncesi</p>
               </div>
               <CardContent className="p-8 space-y-6">
                  <div className="space-y-4 text-sm font-bold">
                    <div className="flex justify-between text-slate-500">
                      <span>Ara Toplam</span>
                      <span className="text-slate-900">₺{totalPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Kargo</span>
                      <span className={cn(shippingCost === 0 ? "text-green-600" : "text-slate-900")}>
                        {shippingCost === 0 ? "ÜCRETSİZ" : `₺${shippingCost.toLocaleString('tr-TR')}`}
                      </span>
                    </div>
                  </div>
                  
                  <Separator className="bg-slate-100" />
                  
                  <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100/50">
                    <span className="font-bold text-slate-900 uppercase tracking-tighter">Genel Toplam</span>
                    <span className="text-2xl font-black text-blue-600">
                      ₺{(totalPrice + shippingCost).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <Link href="/checkout" className="block w-full">
                    <Button className="w-full h-16 rounded-2xl bg-blue-600 hover:bg-blue-700 text-lg font-bold shadow-xl shadow-blue-100 uppercase tracking-wide group">
                      Ödemeye Geç <ChevronRight size={20} className="ml-2 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </Link>

                  <div className="space-y-4 pt-4">
                    <div className="flex items-center gap-3 text-[11px] font-bold text-slate-500">
                      <ShieldCheck size={18} className="text-green-500" />
                      <span>GÜVENLİ ÖDEME (SSL 256-BIT)</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-bold text-slate-500">
                      <CreditCard size={18} className="text-blue-500" />
                      <span>TÜM KARTLARA TAKSİT İMKANI</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-bold text-slate-500">
                      <Truck size={18} className="text-purple-500" />
                      <span>AYNI GÜN ÜCRETSİZ KARGO</span>
                    </div>
                  </div>
               </CardContent>
            </Card>

            {/* Campaign / Promo Code */}
            <Card className="border-none shadow-sm bg-slate-50 p-6 rounded-3xl">
              <h4 className="text-sm font-bold mb-4 uppercase tracking-wider">İndirim Kuponu</h4>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Kupon Kodu"
                  className="w-full h-12 px-4 rounded-xl border-2 border-slate-200 focus:outline-none focus:border-blue-500 bg-white transition-all font-medium uppercase placeholder:lowercase"
                />
                <Button variant="default" className="h-12 px-6 rounded-xl font-bold bg-slate-900">UYGULA</Button>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
