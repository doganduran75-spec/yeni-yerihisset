"use client";

import { useCartStore, CartItem, GiftVariant } from "@/store/useCartStore";
import Link from "next/link";
import {
  ShoppingBag, Trash2, Plus, Minus, ArrowLeft, ChevronRight,
  ShieldCheck, CreditCard, Truck, User, Gift, X, Check,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

// ── Varyant Seçici Modal ─────────────────────────────────────────────────────
function GiftVariantModal({
  ruleId,
  title,
  image,
  originalPrice,
  variants,
  hasVariants,
  onConfirm,
  onDismiss,
}: {
  ruleId: string;
  title: string;
  image: string;
  originalPrice: number;
  variants: GiftVariant[];
  hasVariants: boolean;
  onConfirm: (variant: GiftVariant | null) => void;
  onDismiss: () => void;
}) {
  const [selected, setSelected] = useState<GiftVariant | null>(
    !hasVariants ? null : null
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-5 animate-in slide-in-from-bottom-4">
        {/* Başlık */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Gift size={18} className="text-olive-600" />
            <span className="font-bold text-slate-900 text-sm">Hediyenizi Seçin</span>
          </div>
          <button onClick={onDismiss} className="p-1 text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        {/* Ürün önizleme */}
        <div className="flex items-center gap-3 p-3 bg-olive-50 rounded-2xl">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={title} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-olive-100 flex items-center justify-center flex-shrink-0">
              <Gift size={20} className="text-olive-400" />
            </div>
          )}
          <div>
            <p className="font-semibold text-slate-900 text-sm">{title}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-slate-400 line-through">
                ₺{originalPrice.toLocaleString("tr-TR")}
              </span>
              <Badge className="bg-olive-600 text-white text-[10px] px-1.5 py-0">Ücretsiz</Badge>
            </div>
          </div>
        </div>

        {/* Varyant seçimi */}
        {hasVariants && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Seçenek Seçin</p>
            <div className="flex flex-wrap gap-2">
              {variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelected(v)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all",
                    selected?.id === v.id
                      ? "border-olive-600 bg-olive-600 text-white"
                      : "border-slate-200 text-slate-700 hover:border-olive-300"
                  )}
                >
                  {v.value}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Butonlar */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 rounded-xl text-sm"
            onClick={onDismiss}
          >
            Reddet
          </Button>
          <Button
            className="flex-1 rounded-xl bg-olive-600 hover:bg-olive-700 text-sm gap-1.5"
            disabled={hasVariants && !selected}
            onClick={() => onConfirm(hasVariants ? selected : null)}
          >
            <Check size={14} /> Ekle
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Hediye Sepet Kartı ───────────────────────────────────────────────────────
function GiftCard({ item, onRemove }: { item: CartItem; onRemove: () => void }) {
  return (
    <Card className="border-l-4 border-l-olive-300 bg-olive-50/60 shadow-sm overflow-hidden">
      <CardContent className="p-4 md:p-5">
        <div className="flex gap-3 md:gap-4">
          <div className="w-16 h-20 md:w-20 md:h-24 bg-white rounded-xl overflow-hidden shrink-0 border border-olive-100">
            {item.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Gift size={20} className="text-olive-300" />
              </div>
            )}
          </div>
          <div className="flex-1 flex flex-col justify-between py-0.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Gift size={12} className="text-olive-600" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-olive-600">Hediye</span>
                </div>
                <p className="font-bold text-slate-900 text-sm leading-tight">{item.title}</p>
                {item.variant_name && (
                  <p className="text-xs font-semibold text-olive-600 mt-0.5">{item.variant_name}</p>
                )}
              </div>
              <button
                onClick={onRemove}
                className="p-1.5 text-slate-300 hover:text-red-400 transition-colors flex-shrink-0"
                title="Hediyeyi Kaldır"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 line-through">
                ₺{(item.original_price ?? 0).toLocaleString("tr-TR")}
              </span>
              <Badge className="bg-olive-600 text-white text-[10px] px-1.5 py-0">Ücretsiz</Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Normal Sepet Kartı ───────────────────────────────────────────────────────
function CartCard({
  item,
  onRemove,
  onUpdateQty,
}: {
  item: CartItem;
  onRemove: () => void;
  onUpdateQty: (qty: number) => void;
}) {
  return (
    <Card className="border-none shadow-sm overflow-hidden group hover:shadow-md transition-shadow">
      <CardContent className="p-4 md:p-6">
        <div className="flex gap-4 md:gap-6">
          <div className="w-24 h-32 md:w-32 md:h-40 bg-slate-50 rounded-2xl overflow-hidden shrink-0 border border-slate-100">
            <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 flex flex-col justify-between py-1">
            <div className="space-y-1">
              <div className="flex justify-between items-start gap-4">
                <h3 className="font-bold text-slate-900 md:text-lg line-clamp-1">{item.title}</h3>
                <button onClick={onRemove} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                  <Trash2 size={18} />
                </button>
              </div>
              {item.variant_name && (
                <p className="text-sm font-bold text-olive-600 uppercase tracking-widest">{item.variant_name}</p>
              )}
            </div>
            <div className="flex items-end justify-between">
              <div className="flex items-center gap-1 border-2 border-slate-100 rounded-xl p-0.5 bg-slate-50">
                <button onClick={() => onUpdateQty(item.quantity - 1)} className="p-2 hover:bg-white rounded-lg transition-colors">
                  <Minus size={14} />
                </button>
                <span className="w-8 text-center font-bold text-sm">{item.quantity}</span>
                <button onClick={() => onUpdateQty(item.quantity + 1)} className="p-2 hover:bg-white rounded-lg transition-colors">
                  <Plus size={14} />
                </button>
              </div>
              <div className="text-right">
                <p className="text-lg font-black text-slate-900">
                  ₺{(item.price * item.quantity).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] text-slate-400 font-bold">
                  BİRİM: ₺{item.price.toLocaleString("tr-TR")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Ana Sayfa ────────────────────────────────────────────────────────────────
export default function CartPage() {
  const {
    items, removeItem, updateQuantity, getTotalPrice, clearCart,
    pendingGifts, confirmGift, dismissGift,
  } = useCartStore();
  const [mounted, setMounted] = useState(false);
  const [activePending, setActivePending] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Yeni pending gift geldiğinde otomatik modal aç (ilki)
  useEffect(() => {
    if (pendingGifts.length > 0 && !activePending) {
      setActivePending(pendingGifts[0].rule_id);
    }
    if (pendingGifts.length === 0) {
      setActivePending(null);
    }
  }, [pendingGifts, activePending]);

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

  // ── Sıralama: normal item → per_item hediyeleri → (sona) per_order hediyeleri
  const regularItems = items.filter((i) => !i.is_gift);
  const perItemGifts = items.filter((i) => i.is_gift && !!i.trigger_item_id);
  const perOrderGifts = items.filter((i) => i.is_gift && !i.trigger_item_id);

  const displayItems: CartItem[] = [];
  for (const item of regularItems) {
    displayItems.push(item);
    perItemGifts.filter((g) => g.trigger_item_id === item.id).forEach((g) => displayItems.push(g));
  }
  displayItems.push(...perOrderGifts);

  const totalGifts = items.filter((i) => i.is_gift).length + pendingGifts.length;

  if (items.length === 0 && pendingGifts.length === 0) {
    return (
      <div className="min-h-screen bg-white">
        <header className="border-b">
          <div className="container mx-auto px-4 h-16 flex items-center">
            <Link href="/" className="text-xl font-black tracking-tighter text-olive-600">
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
              Görünüşe göre henüz sepetinize bir ürün eklememişsiniz.
            </p>
          </div>
          <Link href="/" className={cn(buttonVariants({ size: "lg" }), "h-14 px-10 rounded-2xl bg-olive-600 hover:bg-olive-700 shadow-xl shadow-olive-100 font-bold")}>
            Alışverişe Başla
          </Link>
        </main>
      </div>
    );
  }

  const activePendingGift = pendingGifts.find((p) => p.rule_id === activePending);

  return (
    <div className="min-h-screen bg-[#fafbfc]">
      {/* Varyant seçici modal */}
      {activePendingGift && (
        <GiftVariantModal
          ruleId={activePendingGift.rule_id}
          title={activePendingGift.title}
          image={activePendingGift.image}
          originalPrice={activePendingGift.original_price}
          variants={activePendingGift.variants}
          hasVariants={activePendingGift.has_variants}
          onConfirm={(variant) => {
            confirmGift(activePendingGift.rule_id, variant);
            // Sıradaki pending varsa ona geç
            const remaining = pendingGifts.filter((p) => p.rule_id !== activePendingGift.rule_id);
            setActivePending(remaining[0]?.rule_id ?? null);
          }}
          onDismiss={() => {
            dismissGift(activePendingGift.rule_id);
            const remaining = pendingGifts.filter((p) => p.rule_id !== activePendingGift.rule_id);
            setActivePending(remaining[0]?.rule_id ?? null);
          }}
        />
      )}

      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-black tracking-tighter text-olive-600 group flex items-center gap-2">
            <ArrowLeft size={18} className="text-slate-400 group-hover:-translate-x-1 transition-transform" />
            Yeri<span className="text-slate-900">Hisset</span>
          </Link>
          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-sm font-bold text-slate-500">
              SEPETİM ({regularItems.length})
              {totalGifts > 0 && (
                <span className="ml-1 text-olive-600">+{totalGifts} hediye</span>
              )}
            </div>
            <Link href="/account" className="flex items-center gap-2 p-2 hover:bg-slate-100 rounded-full transition-colors group">
              <User size={20} className="text-slate-700 group-hover:text-olive-600 transition-colors" />
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 md:py-12">
        <div className="grid lg:grid-cols-3 gap-8">

          {/* Sepet listesi */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-black text-slate-900">Alışveriş Sepeti</h1>
              <Button
                variant="ghost" size="sm"
                onClick={clearCart}
                className="text-red-500 hover:text-red-700 hover:bg-red-50 font-bold"
              >
                TÜMÜNÜ SİL
              </Button>
            </div>

            {/* Bekleyen hediye banner'ları (seçim yapılmamış, modal kapalıyken) */}
            {pendingGifts.filter((p) => p.rule_id !== activePending).map((p) => (
              <div
                key={p.rule_id}
                className="flex items-center justify-between gap-3 px-4 py-3 bg-olive-50 border border-olive-200 rounded-2xl"
              >
                <div className="flex items-center gap-2 text-sm">
                  <Gift size={16} className="text-olive-600 flex-shrink-0" />
                  <span className="font-semibold text-olive-900">
                    🎁 <span className="font-bold">{p.title}</span> hediye kazandınız!
                  </span>
                </div>
                <button
                  onClick={() => setActivePending(p.rule_id)}
                  className="text-xs font-bold text-olive-600 hover:text-olive-800 whitespace-nowrap border border-olive-300 rounded-full px-3 py-1 hover:bg-olive-100 transition-colors"
                >
                  {p.has_variants ? "Renk Seç →" : "Ekle →"}
                </button>
              </div>
            ))}

            {/* Sıralı liste: normal + per_item hediyeleri + per_order hediyeleri */}
            <div className="space-y-3">
              {displayItems.map((item) =>
                item.is_gift ? (
                  <GiftCard key={item.id} item={item} onRemove={() => removeItem(item.id)} />
                ) : (
                  <CartCard
                    key={item.id}
                    item={item}
                    onRemove={() => removeItem(item.id)}
                    onUpdateQty={(qty) => updateQuantity(item.id, qty)}
                  />
                )
              )}
            </div>

            <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-olive-600 hover:gap-3 transition-all pt-4">
              <ArrowLeft size={16} /> Alışverişe Devam Et
            </Link>
          </div>

          {/* Ödeme Özeti */}
          <div className="space-y-6">
            <Card className="border-none shadow-lg shadow-olive-900/5 bg-white rounded-3xl overflow-hidden">
              <div className="bg-olive-600 p-6 text-white">
                <h2 className="text-xl font-black">Ödeme Özeti</h2>
                <p className="text-olive-200 text-xs font-bold uppercase tracking-widest">Sipariş Onayı Öncesi</p>
              </div>
              <CardContent className="p-8 space-y-6">
                <div className="space-y-4 text-sm font-bold">
                  <div className="flex justify-between text-slate-500">
                    <span>Ara Toplam</span>
                    <span className="text-slate-900">₺{totalPrice.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</span>
                  </div>
                  {totalGifts > 0 && (
                    <div className="flex justify-between text-olive-600">
                      <span className="flex items-center gap-1">
                        <Gift size={12} /> {totalGifts} Hediye
                      </span>
                      <span>Ücretsiz</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-500">
                    <span>Kargo</span>
                    <span className={cn(shippingCost === 0 ? "text-green-600" : "text-slate-900")}>
                      {shippingCost === 0 ? "ÜCRETSİZ" : `₺${shippingCost.toLocaleString("tr-TR")}`}
                    </span>
                  </div>
                </div>

                <Separator className="bg-slate-100" />

                <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100/50">
                  <span className="font-bold text-slate-900 uppercase tracking-tighter">Genel Toplam</span>
                  <span className="text-2xl font-black text-olive-600">
                    ₺{(totalPrice + shippingCost).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <Link href="/checkout" className="block w-full">
                  <Button className="w-full h-16 rounded-2xl bg-olive-600 hover:bg-olive-700 text-lg font-bold shadow-xl shadow-olive-100 uppercase tracking-wide group">
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

            {/* Kupon */}
            <Card className="border-none shadow-sm bg-slate-50 p-6 rounded-3xl">
              <h4 className="text-sm font-bold mb-4 uppercase tracking-wider">İndirim Kuponu</h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Kupon Kodu"
                  className="w-full h-12 px-4 rounded-xl border-2 border-slate-200 focus:outline-none focus:border-olive-500 bg-white transition-all font-medium uppercase placeholder:lowercase"
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
