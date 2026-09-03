"use client";

import { useCartStore, CartItem, GiftVariant, PendingGift } from "@/store/useCartStore";
import Link from "next/link";
import {
  ShoppingBag, Trash2, Plus, Minus, ArrowLeft, ChevronRight,
  ShieldCheck, CreditCard, Truck, User, Gift, X, Check, Ticket, Loader2,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// ── Varyant Seçici Modal ─────────────────────────────────────────────────────
function GiftVariantModal({
  title,
  image,
  originalPrice,
  variants,
  hasVariants,
  onConfirm,
  onDismiss,
}: {
  title: string;
  image: string;
  originalPrice: number;
  variants: GiftVariant[];
  hasVariants: boolean;
  onConfirm: (variant: GiftVariant | null) => void;
  onDismiss: () => void;
}) {
  const [selected, setSelected] = useState<GiftVariant | null>(null);

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
            Vazgeç
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
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1 border-2 border-slate-100 rounded-xl p-0.5 bg-slate-50 w-fit">
                  <button
                    onClick={() => onUpdateQty(item.quantity - 1)}
                    disabled={item.quantity <= 1}
                    className="p-2 hover:bg-white rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-8 text-center font-bold text-sm">{item.quantity}</span>
                  <button
                    onClick={() => onUpdateQty(item.quantity + 1)}
                    disabled={item.stock > 0 && item.quantity >= item.stock}
                    className="p-2 hover:bg-white rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                {item.stock > 0 && item.quantity >= item.stock && (
                  <span className="text-[10px] font-bold text-amber-600">Stoktaki son {item.stock} ürün</span>
                )}
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

// ── Kupon bölümü (panel içi, dış Card yok) ───────────────────────────────────
function CouponSection({
  cartTotal,
  onApplied,
}: {
  cartTotal: number;
  onApplied: (discount: number, freeShipping: boolean) => void;
}) {
  const { couponCode, setCouponCode } = useCartStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [userCoupons, setUserCoupons] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [applied, setApplied] = useState<{ name: string; discount: number; free_shipping: boolean } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  const onAppliedRef = useRef(onApplied);
  onAppliedRef.current = onApplied;

  // Kullanıcı + hesabına tanımlı kuponları yükle
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setLoggedIn(!!user);
      if (!user) return;
      const { data: uc } = await supabase
        .from("user_coupons")
        .select("*, coupons(*)")
        .eq("user_id", user.id);
      const now = new Date();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setUserCoupons(((uc as any[]) || []).filter((x) => {
        const c = x.coupons;
        if (!c || !c.is_active) return false;
        if (c.expires_at && new Date(c.expires_at) < now) return false;
        if (x.use_count >= c.per_user_limit) return false;
        return true;
      }));
    })();
  }, []);

  // couponCode veya sepet toplamı değişince doğrula (indirim tutara bağlı)
  useEffect(() => {
    if (!couponCode) {
      setApplied(null);
      onAppliedRef.current(0, false);
      return;
    }
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/coupons/validate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ code: couponCode, cartTotal }),
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let d: any = {};
        try { d = await res.json(); } catch { /* JSON değil */ }
        if (!active) return;
        if (res.ok && d.valid) {
          setApplied({ name: d.name || "İndirim", discount: d.discount_amount || 0, free_shipping: !!d.free_shipping });
          onAppliedRef.current(d.discount_amount || 0, !!d.free_shipping);
        } else {
          setApplied(null);
          onAppliedRef.current(0, false);
          setError(d.error || (res.status === 401 ? "Kupon için giriş yapın." : `Kupon uygulanamadı (${res.status})`));
          setCouponCode("");
        }
      } catch {
        if (!active) return;
        setApplied(null);
        onAppliedRef.current(0, false);
        setError("Bağlantı hatası, tekrar deneyin.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couponCode, cartTotal]);

  function apply() {
    const c = input.trim().toUpperCase();
    if (c) setCouponCode(c);
  }
  function remove() {
    setCouponCode("");
    setInput("");
    setError("");
  }

  return (
    <div>
      <h4 className="text-xs font-bold mb-3 uppercase tracking-wider flex items-center gap-2 text-slate-500">
        <Ticket size={14} className="text-olive-600" /> İndirim Kuponu
      </h4>

      {applied ? (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
          <div>
            <p className="text-xs font-black text-green-800">{applied.name}</p>
            <p className="text-[10px] text-green-600 font-mono font-bold">
              {couponCode}
              {applied.free_shipping
                ? " · Ücretsiz kargo"
                : applied.discount > 0
                ? ` · -₺${applied.discount.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}`
                : ""}
            </p>
          </div>
          <button onClick={remove} className="text-green-500 hover:text-red-500 transition-colors p-1">
            <X size={16} />
          </button>
        </div>
      ) : loggedIn === false ? (
        <p className="text-xs text-slate-500">
          Kupon kullanmak için{" "}
          <Link href="/login?redirect=/sepet" className="font-bold text-olive-600 underline">giriş yapın</Link>.
        </p>
      ) : (
        <div className="space-y-2">
          {userCoupons.length > 0 && (
            <select
              className="flex h-12 w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm font-bold"
              value=""
              onChange={(e) => { if (e.target.value) setInput(e.target.value); }}
            >
              <option value="">— Hesabınızdaki kuponlar —</option>
              {userCoupons.map((uc) => (
                <option key={uc.id} value={uc.coupons?.code}>
                  {uc.coupons?.code} — {uc.coupons?.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } }}
              placeholder="Kupon Kodu"
              className="w-full h-12 px-4 rounded-xl border-2 border-slate-200 focus:outline-none focus:border-olive-500 bg-white transition-all font-medium uppercase placeholder:lowercase"
            />
            <Button onClick={apply} disabled={loading || !input.trim()} className="h-12 px-6 rounded-xl font-bold bg-slate-900">
              {loading ? <Loader2 size={16} className="animate-spin" /> : "UYGULA"}
            </Button>
          </div>
          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
        </div>
      )}
    </div>
  );
}

// ── Ödül (ücretsiz ürün) satırları ───────────────────────────────────────────
type RewardGroup = { key: string; group: string | null; confirmed: CartItem[]; pending: PendingGift[] };

function RewardRows({ onPickVariant }: { onPickVariant: (p: PendingGift) => void }) {
  const { items, pendingGifts, confirmGift, dismissGift, removeItem } = useCartStore();

  const confirmedGifts = items.filter((i) => i.is_gift);
  const pending = pendingGifts ?? [];
  if (confirmedGifts.length === 0 && pending.length === 0) return null;

  // Grupla: aynı selection_group → tek grup; grup yoksa (null) her ödül kendi grubu
  const map = new Map<string, RewardGroup>();
  const keyOf = (grp: string | null, id: string) => (grp ? `g:${grp}` : `s:${id}`);
  for (const it of confirmedGifts) {
    const k = keyOf(it.selection_group ?? null, it.id);
    if (!map.has(k)) map.set(k, { key: k, group: it.selection_group ?? null, confirmed: [], pending: [] });
    map.get(k)!.confirmed.push(it);
  }
  for (const p of pending) {
    const k = keyOf(p.selection_group ?? null, p.rule_id);
    if (!map.has(k)) map.set(k, { key: k, group: p.selection_group ?? null, confirmed: [], pending: [] });
    map.get(k)!.pending.push(p);
  }
  const groups = [...map.values()];

  function pick(p: PendingGift) {
    if (p.has_variants) onPickVariant(p);
    else confirmGift(p.rule_id, null);
  }

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 text-slate-500">
        <Gift size={14} className="text-olive-600" /> Ücretsiz Ürünler
      </h4>

      {groups.map((g) => {
        const chosen = g.confirmed[0];

        // ── Seçim yapılmış grup: seçileni öne çıkar, diğerlerini pasif göster ──
        if (chosen) {
          return (
            <div key={g.key} className="rounded-2xl border border-olive-200 bg-olive-50/60 p-3 space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white rounded-xl overflow-hidden shrink-0 border border-olive-100 flex items-center justify-center">
                  {chosen.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={chosen.image} alt={chosen.title} className="w-full h-full object-cover" />
                  ) : (
                    <Gift size={18} className="text-olive-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 text-sm leading-tight truncate">{chosen.title}</p>
                  {chosen.variant_name && (
                    <p className="text-xs font-semibold text-olive-600">{chosen.variant_name}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Check size={12} className="text-green-600" />
                    <span className="text-[10px] font-bold text-green-700 uppercase tracking-wide">Sepete eklendi</span>
                    <Badge className="bg-olive-600 text-white text-[10px] px-1.5 py-0">Ücretsiz</Badge>
                  </div>
                </div>
                <button
                  onClick={() => removeItem(chosen.id)}
                  className="p-1.5 text-slate-300 hover:text-red-400 transition-colors shrink-0"
                  title="Kaldır"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Aynı gruptaki diğer seçenekler — pasif */}
              {g.pending.length > 0 && (
                <div className="pt-2 border-t border-olive-100 space-y-1.5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Diğer seçenekler</p>
                  {g.pending.map((p) => (
                    <div key={p.rule_id} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500 truncate">{p.title}</span>
                      <button
                        onClick={() => pick(p)}
                        className="text-[11px] font-bold text-olive-600 hover:text-olive-800 whitespace-nowrap border border-olive-200 rounded-full px-2.5 py-0.5 hover:bg-olive-100 transition-colors"
                      >
                        {p.has_variants ? "Renk seç" : "Bunu seç"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }

        // ── Henüz seçilmemiş grup: teklif kartları ──
        return (
          <div key={g.key} className="space-y-2">
            {g.group && g.pending.length > 1 && (
              <p className="text-[10px] font-bold text-olive-600 uppercase tracking-wide">Birini seçin</p>
            )}
            {g.pending.map((p) => (
              <div key={p.rule_id} className="flex items-center gap-3 rounded-2xl border border-olive-200 bg-white p-3">
                <div className="w-12 h-12 bg-olive-50 rounded-xl overflow-hidden shrink-0 border border-olive-100 flex items-center justify-center">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt={p.title} className="w-full h-full object-cover" />
                  ) : (
                    <Gift size={18} className="text-olive-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 text-sm leading-tight truncate">🎁 {p.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {p.original_price > 0 && (
                      <span className="text-[10px] text-slate-400 line-through">
                        ₺{p.original_price.toLocaleString("tr-TR")}
                      </span>
                    )}
                    <Badge className="bg-olive-600 text-white text-[10px] px-1.5 py-0">Ücretsiz</Badge>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <button
                    onClick={() => pick(p)}
                    className="text-xs font-bold text-white bg-olive-600 hover:bg-olive-700 rounded-full px-3.5 py-1.5 transition-colors"
                  >
                    {p.has_variants ? "Renk Seç" : "Ekle"}
                  </button>
                  <button
                    onClick={() => dismissGift(p.rule_id)}
                    className="text-[10px] text-slate-400 hover:text-slate-600"
                  >
                    Vazgeç
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Birleşik panel: Ücretsiz Ürünler + İndirim Kuponu ────────────────────────
function RewardsAndCouponPanel({
  cartTotal,
  onApplied,
  onPickVariant,
  hasRewards,
}: {
  cartTotal: number;
  onApplied: (discount: number, freeShipping: boolean) => void;
  onPickVariant: (p: PendingGift) => void;
  hasRewards: boolean;
}) {
  return (
    <Card className="border-none shadow-sm bg-white p-6 rounded-3xl space-y-5">
      <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
        <Gift size={16} className="text-olive-600" /> İndirim &amp; Ücretsiz Ürünler
      </h3>

      {hasRewards && (
        <>
          <RewardRows onPickVariant={onPickVariant} />
          <Separator className="bg-slate-100" />
        </>
      )}

      <CouponSection cartTotal={cartTotal} onApplied={onApplied} />
    </Card>
  );
}

// ── Ana Sayfa ────────────────────────────────────────────────────────────────
export default function CartPage() {
  const {
    items, removeItem, updateQuantity, getTotalPrice, clearCart,
    pendingGifts, confirmGift,
  } = useCartStore();
  const [mounted, setMounted] = useState(false);
  const [activePending, setActivePending] = useState<string | null>(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponFreeShip, setCouponFreeShip] = useState(false);
  // F10: canlı stok doğrulama (sepette bekleyen ürün başkası tarafından tükenmiş olabilir)
  const [liveStock, setLiveStock] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sepet açılınca / öğeler değişince gerçek stoğu çek
  const cartIdsKey = items.filter((i) => !i.is_gift).map((i) => i.id).join(",");
  useEffect(() => {
    (async () => {
      const regs = items.filter((i) => !i.is_gift);
      if (regs.length === 0) { setLiveStock({}); return; }
      const variantIds = regs.filter((i) => i.variant_id).map((i) => i.variant_id!) as string[];
      const productIds = regs.filter((i) => !i.variant_id).map((i) => i.product_id);
      const [vRes, pRes] = await Promise.all([
        variantIds.length ? supabase.from("product_variants").select("id, stock").in("id", variantIds) : Promise.resolve({ data: [] as any[] }),
        productIds.length ? supabase.from("products").select("id, stock").in("id", productIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const vMap = new Map(((vRes.data as any[]) || []).map((v) => [v.id, Number(v.stock ?? 0)]));
      const pMap = new Map(((pRes.data as any[]) || []).map((p) => [p.id, Number(p.stock ?? 0)]));
      const map: Record<string, number> = {};
      for (const it of regs) {
        map[it.id] = it.variant_id ? (vMap.get(it.variant_id) ?? 0) : (pMap.get(it.product_id) ?? 0);
      }
      setLiveStock(map);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartIdsKey]);

  // Uygun hediye kalmadıysa açık modalı kapat
  useEffect(() => {
    const gifts = pendingGifts ?? [];
    if (activePending && !gifts.some((p) => p.rule_id === activePending)) {
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
  const shippingCost = (totalPrice > 500 || couponFreeShip) ? 0 : 29.90;
  const finalTotal = Math.max(0, totalPrice + shippingCost - couponDiscount);

  const regularItems = items.filter((i) => !i.is_gift);
  const safePending = pendingGifts ?? [];
  const confirmedGiftCount = items.filter((i) => i.is_gift).length;
  const totalGifts = confirmedGiftCount + safePending.length;
  const hasRewards = confirmedGiftCount > 0 || safePending.length > 0;

  // F10: canlı stoğa göre sorunlu öğeler (adet stoğu aşıyor / tükendi)
  const stockIssues = liveStock
    ? regularItems
        .map((i) => ({ item: i, live: liveStock[i.id] ?? 0 }))
        .filter(({ item, live }) => live < item.quantity)
    : [];
  const checkoutBlocked = stockIssues.length > 0;

  if (items.length === 0 && safePending.length === 0) {
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

  const activePendingGift = safePending.find((p) => p.rule_id === activePending);

  return (
    <div className="min-h-screen bg-[#fafbfc]">
      {/* Varyant seçici modal */}
      {activePendingGift && (
        <GiftVariantModal
          title={activePendingGift.title}
          image={activePendingGift.image}
          originalPrice={activePendingGift.original_price}
          variants={activePendingGift.variants}
          hasVariants={activePendingGift.has_variants}
          onConfirm={(variant) => {
            confirmGift(activePendingGift.rule_id, variant);
            setActivePending(null);
          }}
          onDismiss={() => setActivePending(null)}
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

            {/* F10: canlı stok uyarısı — adedi aşan/tükenen öğeler */}
            {stockIssues.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2">
                <p className="text-sm font-bold text-amber-800 flex items-center gap-2">
                  <ShieldCheck size={16} /> Sepetinde stok değişikliği var
                </p>
                {stockIssues.map(({ item, live }) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-amber-900 min-w-0 truncate">
                      <b>{item.title}</b>{item.variant_name ? ` · ${item.variant_name}` : ""} —{" "}
                      {live <= 0 ? "tükendi" : `sadece ${live} adet kaldı (sepette ${item.quantity})`}
                    </span>
                    {live <= 0 ? (
                      <button onClick={() => removeItem(item.id)} className="shrink-0 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg px-3 py-1.5">Kaldır</button>
                    ) : (
                      <button onClick={() => updateQuantity(item.id, live)} className="shrink-0 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg px-3 py-1.5">{live} adete düşür</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Yalnızca satın alınan ürünler; hediyeler sağdaki panelde yönetilir */}
            <div className="space-y-3">
              {regularItems.map((item) => (
                <CartCard
                  key={item.id}
                  item={item}
                  onRemove={() => removeItem(item.id)}
                  onUpdateQty={(qty) => updateQuantity(item.id, qty)}
                />
              ))}
            </div>

            <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-olive-600 hover:gap-3 transition-all pt-4">
              <ArrowLeft size={16} /> Alışverişe Devam Et
            </Link>
          </div>

          {/* Ödeme Özeti */}
          <div className="space-y-6">
            {/* Birleşik panel: ücretsiz ürünler + indirim kuponu */}
            <RewardsAndCouponPanel
              cartTotal={totalPrice}
              hasRewards={hasRewards}
              onPickVariant={(p) => setActivePending(p.rule_id)}
              onApplied={(d, fs) => { setCouponDiscount(d); setCouponFreeShip(fs); }}
            />

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
                  {couponDiscount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span className="flex items-center gap-1"><Ticket size={12} /> İndirim</span>
                      <span>-₺{couponDiscount.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                </div>

                <Separator className="bg-slate-100" />

                <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100/50">
                  <span className="font-bold text-slate-900 uppercase tracking-tighter">Genel Toplam</span>
                  <span className="text-2xl font-black text-olive-600">
                    ₺{finalTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {checkoutBlocked ? (
                  <div className="space-y-2">
                    <Button disabled className="w-full h-16 rounded-2xl bg-slate-300 text-lg font-bold uppercase tracking-wide cursor-not-allowed">
                      Ödemeye Geç
                    </Button>
                    <p className="text-xs text-center text-amber-600 font-medium">
                      Devam etmek için yukarıdaki stok uyarısını çözün.
                    </p>
                  </div>
                ) : (
                  <Link href="/checkout" className="block w-full">
                    <Button className="w-full h-16 rounded-2xl bg-olive-600 hover:bg-olive-700 text-lg font-bold shadow-xl shadow-olive-100 uppercase tracking-wide group">
                      Ödemeye Geç <ChevronRight size={20} className="ml-2 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </Link>
                )}

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

          </div>
        </div>
      </main>
    </div>
  );
}
