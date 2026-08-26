"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
  Star,
  Shield,
  Truck,
  RefreshCcw,
  Plus,
  Minus,
  Check,
  Share2,
  ExternalLink,
  User,
  Bell,
  BellRing,
  X,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import ProductReviews from "@/components/products/ProductReviews";
import StockNotifyModal from "@/components/products/StockNotifyModal";
import { useCartStore } from "@/store/useCartStore";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { supabase } from "@/lib/supabase";
import { trackViewItem, trackAddToCart } from "@/lib/analytics";

type Variant = {
  id: string;
  sku: string | null;
  price: number;
  compare_at_price: number | null;
  stock: number | null;
  is_active: boolean | null;
  variant_option_id: string | null;
  image_url: string | null;
  variant_options: {
    value: string;
    variant_groups: { name: string } | null;
  } | null;
};

type Product = {
  id: string;
  title: string;
  description: string | null;
  short_description: string | null;
  slug: string;
  price: number;
  stock: number;
  images: string[] | null;
  image_url: string | null;
  has_variants: boolean | null;
  category_id: string | null;
  brands: { name: string; slug: string } | null;
  categories: { name: string; slug: string } | null;
  product_variants: Variant[] | null;
};

export default function ProductPageClient({ product }: { product: Product }) {
  const images =
    product.images && product.images.length > 0
      ? product.images
      : [product.image_url || "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?q=80&w=800"];

  const activeVariants = product.product_variants?.filter((v) => v.is_active) ?? [];

  const [selectedImage, setSelectedImage] = useState<string>(images[0]);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);

  // Ok/kaydırma ile görsel değiştir
  const goToImage = (dir: number) => {
    if (images.length < 2) return;
    const idx = images.indexOf(selectedImage);
    const cur = idx < 0 ? 0 : idx;
    setSelectedImage(images[(cur + dir + images.length) % images.length]);
  };
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(
    activeVariants.length > 0 ? activeVariants[0] : null
  );
  const [isAdding, setIsAdding] = useState(false);
  const [toast, setToast] = useState(false);
  const [notifyModalOpen, setNotifyModalOpen] = useState(false);
  // notifiedVariants: başarıyla bildirim kaydedilen variant ID'leri
  const [notifiedVariants, setNotifiedVariants] = useState<Set<string>>(new Set());
  const { addItem, items, checkGiftRules } = useCartStore();

  // GA4: view_item — ürün sayfası yüklenince
  useEffect(() => {
    trackViewItem({
      productId: product.id,
      productName: product.title,
      category: product.categories?.name,
      brand: product.brands?.name,
      price: product.price,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  // OAuth yönlendirmesinden geri döndükten sonra bekleyen bildirimi otomatik gönder
  useEffect(() => {
    async function checkPendingNotify() {
      const raw = localStorage.getItem("pendingStockNotify");
      if (!raw) return;
      let pending: { productId: string; variantId?: string } | null = null;
      try { pending = JSON.parse(raw); } catch {
        localStorage.removeItem("pendingStockNotify");
        return;
      }
      if (!pending || pending.productId !== product.id) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      localStorage.removeItem("pendingStockNotify");
      const res = await fetch("/api/stock-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: pending.productId, variantId: pending.variantId }),
      });
      if (res.ok && pending.variantId) {
        setNotifiedVariants((prev) => new Set(prev).add(pending!.variantId!));
      }
    }
    checkPendingNotify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  // Varyasyon değişince — kendi görseli varsa o görseli göster
  useEffect(() => {
    if (selectedVariant?.image_url) {
      setSelectedImage(selectedVariant.image_url);
    }
  }, [selectedVariant]);

  const currentPrice =
    product.has_variants && selectedVariant ? selectedVariant.price : product.price;
  const currentCompareAt =
    product.has_variants && selectedVariant
      ? (selectedVariant.compare_at_price ?? null)
      : null;
  const currentStock =
    product.has_variants && selectedVariant ? (selectedVariant.stock ?? 0) : product.stock;
  const isOutOfStock = currentStock === 0;

  async function handleAddToCart() {
    const cartId =
      product.has_variants && selectedVariant
        ? `var_${selectedVariant.id}`
        : `prod_${product.id}`;

    addItem({
      id: cartId,
      product_id: product.id,
      variant_id: selectedVariant?.id,
      title: product.title,
      image: selectedImage,
      price: currentPrice,
      quantity,
      stock: currentStock,
      variant_name: selectedVariant?.variant_options?.value,
      category_id: product.category_id ?? undefined,
    });

    // GA4: add_to_cart
    trackAddToCart({
      productId: product.id,
      productName: product.title,
      variantName: selectedVariant?.variant_options?.value,
      category: product.categories?.name,
      brand: product.brands?.name,
      price: currentPrice,
      quantity,
    });

    // Bedelsiz ürün kurallarını kontrol et
    if (product.category_id) {
      const { data: { user } } = await supabase.auth.getUser();
      await checkGiftRules(product.category_id, cartId, user?.id);
    }

    setIsAdding(true);
    setToast(true);
    setTimeout(() => setIsAdding(false), 1000);
    setTimeout(() => setToast(false), 2800);
  }

  return (
    <div className="min-h-screen bg-white">
      {/* ── Sepete Eklendi Toast ─────────────────────────────── */}
      <div
        className={cn(
          "fixed top-6 right-6 z-[200] flex items-center gap-3 bg-white rounded-2xl shadow-2xl shadow-slate-200 border border-slate-100 px-4 py-3 max-w-xs transition-all duration-300",
          toast
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 -translate-y-4 pointer-events-none"
        )}
      >
        {/* Ürün küçük görseli */}
        <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-50 flex-shrink-0 border border-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={selectedImage} alt={product.title} className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
              <Check size={10} className="text-white" strokeWidth={3} />
            </div>
            <span className="text-[11px] font-bold text-green-600 uppercase tracking-wide">Sepete eklendi</span>
          </div>
          <p className="text-xs font-semibold text-slate-800 truncate">{product.title}</p>
          {selectedVariant?.variant_options?.value && (
            <p className="text-[11px] text-slate-400">{selectedVariant.variant_options.value}</p>
          )}
        </div>
        <Link
          href="/cart"
          className="flex-shrink-0 text-[11px] font-bold text-olive-600 hover:text-olive-800 whitespace-nowrap border border-olive-200 rounded-full px-2.5 py-1 hover:bg-olive-50 transition-colors"
        >
          Sepete Git →
        </Link>
        <button
          onClick={() => setToast(false)}
          className="absolute -top-2 -right-2 w-5 h-5 bg-slate-200 hover:bg-slate-300 rounded-full flex items-center justify-center transition-colors"
        >
          <X size={10} />
        </button>
      </div>

      <Navbar />

      <main className="container mx-auto px-4 py-8 md:py-12">
        <div className="grid md:grid-cols-2 gap-12 lg:gap-20 items-start">
          {/* Gallery — sayfa aşağı kaydırılınca sabit kalır */}
          <div className="space-y-4 md:sticky md:top-6 md:self-start">
            <div
              className="aspect-[4/5] rounded-3xl overflow-hidden bg-slate-50 border relative group select-none"
              onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
              onTouchEnd={(e) => {
                if (touchStartX === null) return;
                const dx = e.changedTouches[0].clientX - touchStartX;
                if (Math.abs(dx) > 40) goToImage(dx > 0 ? -1 : 1);
                setTouchStartX(null);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedImage}
                alt={product.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <Badge className="absolute top-6 left-6 bg-white/90 text-slate-900 border-none px-3 py-1 font-bold shadow-sm">
                {product.brands?.name || "Premium"}
              </Badge>

              {/* Sağ/sol oklar — birden fazla görsel varsa */}
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => goToImage(-1)}
                    aria-label="Önceki görsel"
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/85 backdrop-blur hover:bg-white shadow-lg flex items-center justify-center text-slate-800 opacity-80 hover:opacity-100 transition-all active:scale-90"
                  >
                    <ChevronLeft size={22} />
                  </button>
                  <button
                    type="button"
                    onClick={() => goToImage(1)}
                    aria-label="Sonraki görsel"
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/85 backdrop-blur hover:bg-white shadow-lg flex items-center justify-center text-slate-800 opacity-80 hover:opacity-100 transition-all active:scale-90"
                  >
                    <ChevronRight size={22} />
                  </button>
                </>
              )}
            </div>
            {images.length > 1 && (
              <div className="grid grid-cols-4 gap-4">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImage(img)}
                    className={`aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                      selectedImage === img
                        ? "border-olive-600 ring-2 ring-olive-100"
                        : "border-transparent hover:border-slate-200"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img}
                      alt={`${product.title} ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="space-y-8 animate-in fade-in slide-in-from-right duration-700">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Badge variant="outline" className="text-olive-600 border-olive-100 bg-olive-50/50">
                  {product.categories?.name}
                </Badge>
                <div className="flex items-center text-yellow-500 text-sm font-bold">
                  <Star size={16} fill="currentColor" />
                  <Star size={16} fill="currentColor" />
                  <Star size={16} fill="currentColor" />
                  <Star size={16} fill="currentColor" />
                  <Star size={16} fill="currentColor" className="text-slate-200" />
                  <span className="ml-2 text-slate-500">4.0 (12 Değerlendirme)</span>
                </div>
              </div>
              <h1 className="text-4xl md:text-5xl font-black text-slate-900 leading-tight">
                {product.title}
              </h1>
              <div className="flex items-baseline gap-4">
                <span className="text-3xl font-black text-olive-600">
                  ₺{currentPrice.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
                </span>
                {currentCompareAt && currentCompareAt > currentPrice && (
                  <span className="text-lg text-slate-400 line-through">
                    ₺{currentCompareAt.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
                  </span>
                )}
              </div>
            </div>

            <Separator className="bg-slate-100" />

            {/* Kısa açıklama — başlığın altında, varyasyon/sepetten önce */}
            {product.short_description && (
              <div className="text-slate-600 leading-relaxed whitespace-pre-wrap">
                {product.short_description}
              </div>
            )}

            {/* Variants */}
            {product.has_variants && activeVariants.length > 0 && (
              <div className="space-y-4">
                <h3 className="font-bold text-slate-900">
                  {activeVariants[0]?.variant_options?.variant_groups?.name || "Seçenekler"}
                </h3>
                <div className="flex flex-wrap gap-3">
                  {activeVariants.map((v) => {
                    const hasStock = (v.stock ?? 0) > 0;
                    const isSelected = selectedVariant?.id === v.id;
                    const isNotified = notifiedVariants.has(v.id);
                    return (
                      <button
                        key={v.id}
                        onClick={() => setSelectedVariant(v)}
                        className={cn(
                          "relative min-w-[56px] px-4 py-3 rounded-xl border-2 font-bold transition-all text-sm text-center",
                          isSelected
                            ? hasStock
                              ? "border-olive-600 bg-olive-50 text-olive-700 ring-2 ring-olive-100"
                              : "border-amber-400 bg-amber-50 text-amber-700 ring-2 ring-amber-100"
                            : hasStock
                              ? "border-slate-200 hover:border-slate-400 text-slate-700 bg-white"
                              : "border-slate-200 text-slate-500 bg-slate-50 hover:border-slate-300"
                        )}
                      >
                        {v.variant_options?.value ?? v.sku ?? "?"}
                        {isSelected && hasStock && (
                          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-olive-600 rounded-full flex items-center justify-center">
                            <Check size={8} className="text-white" />
                          </span>
                        )}
                        {isNotified && (
                          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                            <Check size={8} className="text-white" />
                          </span>
                        )}
                        {!hasStock && !isNotified && (
                          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-400 rounded-full flex items-center justify-center">
                            <X size={8} className="text-white" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Add to Cart */}
            <div className="space-y-4 pt-4">
              {/* Stokta var → adet seçici */}
              {!isOutOfStock && (
                <div className="flex items-center gap-4">
                  <div className="flex items-center border-2 border-slate-100 rounded-xl p-1 bg-slate-50">
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="p-3 hover:bg-white rounded-lg transition-colors"
                    >
                      <Minus size={18} />
                    </button>
                    <span className="w-12 text-center font-bold text-lg">{quantity}</span>
                    <button
                      onClick={() => setQuantity(quantity + 1)}
                      className="p-3 hover:bg-white rounded-lg transition-colors"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                  <span className="text-sm font-medium text-green-600 flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-green-500 rounded-full inline-block" />
                    {currentStock} Adet Stokta
                  </span>
                </div>
              )}

              {/* Stokta yok → bilgilendirme bandı */}
              {isOutOfStock && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                  <BellRing size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-amber-800">
                      Bu seçenek şu an stokta yok.
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      Stok girişinde sizi haberdar edebiliriz.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-4">
                {!isOutOfStock ? (
                  <>
                    <Button
                      size="lg"
                      className={cn(
                        "flex-1 h-16 rounded-2xl text-lg font-bold shadow-xl gap-3 transition-all duration-300",
                        isAdding
                          ? "bg-green-600 hover:bg-green-700"
                          : "bg-olive-600 hover:bg-olive-700 shadow-olive-100"
                      )}
                      disabled={isAdding}
                      onClick={handleAddToCart}
                    >
                      {isAdding ? <Check size={22} className="animate-in zoom-in" /> : <ShoppingBag size={22} />}
                      {isAdding ? "Sepete Eklendi!" : "Sepete Ekle"}
                    </Button>
                    <Button size="lg" variant="outline" className="h-16 w-16 rounded-2xl p-0 border-2">
                      <Star size={22} className="text-slate-400" />
                    </Button>
                  </>
                ) : selectedVariant && notifiedVariants.has(selectedVariant.id) ? (
                  /* Bildirim zaten kaydedildi */
                  <div className="flex-1 h-16 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center gap-2 text-green-700 font-bold text-sm">
                    <Check size={18} /> Bildirim Kaydedildi
                  </div>
                ) : (
                  /* Bildirim kaydet butonu */
                  <Button
                    size="lg"
                    variant="outline"
                    className="flex-1 h-16 rounded-2xl border-2 border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 font-bold gap-3 transition-all"
                    onClick={() => setNotifyModalOpen(true)}
                  >
                    <Bell size={20} />
                    Stoka Girince Haber Ver
                  </Button>
                )}
              </div>
            </div>

            {/* Benefits */}
            <div className="grid grid-cols-3 gap-4 pt-4">
              {[
                { icon: Truck, label: "Hızlı Kargo" },
                { icon: RefreshCcw, label: "Kolay İade" },
                { icon: Shield, label: "Güvenli" },
              ].map(({ icon: Icon, label }) => (
                <Card key={label} className="border-none bg-slate-50 shadow-none">
                  <CardContent className="p-4 flex flex-col items-center text-center space-y-2">
                    <Icon className="text-olive-600" size={24} />
                    <span className="text-[10px] font-bold text-slate-900 uppercase">{label}</span>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Müşteri yorumları — sağ sütunda (sol foto sabit kalsın diye) */}
            <ProductReviews productId={product.id} />

            {/* Detaylı açıklama — yorumların altında */}
            {product.description && (
              <section className="border-t border-slate-100 pt-8">
                <h2 className="text-2xl font-black text-slate-900 mb-4">Ürün Açıklaması</h2>
                <div className="text-slate-600 leading-relaxed whitespace-pre-wrap">
                  {product.description}
                </div>
              </section>
            )}
          </div>
        </div>
      </main>

      <Footer />

      {/* Stok bildirimi modalı */}
      <StockNotifyModal
        open={notifyModalOpen}
        onClose={() => setNotifyModalOpen(false)}
        onSuccess={(vid) => {
          setNotifyModalOpen(false);
          if (vid) setNotifiedVariants((prev) => new Set(prev).add(vid));
        }}
        productId={product.id}
        productTitle={product.title}
        variantId={selectedVariant?.id}
        variantName={selectedVariant?.variant_options?.value}
      />
    </div>
  );
}
