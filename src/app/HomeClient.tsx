"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCartStore } from "@/store/useCartStore";
import { fetchItemStock } from "@/lib/live-stock";
import Navbar from "@/components/Navbar";
import MobileHome from "@/components/MobileHome";
import DesktopHome from "@/components/DesktopHome";

// Ana sayfanın etkileşimli (client) kısmı. Ürünler SUNUCUDAN prop olarak gelir
// (ISR ile önbelleklenir) — böylece ilk boyamada ürünler hazır, tarayıcı ayrıca
// Supabase'e sorgu atmaz, SEO için ürünler HTML'de olur.
export default function HomeClient({ initialProducts }: { initialProducts: any[] }) {
  const products = initialProducts || [];
  const [addedId, setAddedId] = useState<string | null>(null); // sepete ekleme animasyonu
  const [stockMsg, setStockMsg] = useState<string | null>(null);
  const { addItem, checkGiftRules } = useCartStore();

  // Varyantsız ürünü tek tıkla sepete ekle (öne çıkan kartlar)
  async function handleQuickAdd(product: any) {
    const cartId = `prod_${product.id}`;
    // Sayfa önbellekli → sepete atmadan önce güncel stoğu sor
    setStockMsg(null);
    const live = await fetchItemStock(product.id, null);
    const inCart = useCartStore.getState().items.find((i) => i.id === cartId)?.quantity ?? 0;
    if (live !== null && live - inCart <= 0) {
      setStockMsg(live <= 0 ? `${product.title} az önce tükendi.` : `${product.title} — stoktaki son ${live} adet zaten sepetinde.`);
      setTimeout(() => setStockMsg(null), 5000);
      return;
    }
    addItem({
      id: cartId,
      product_id: product.id,
      title: product.title,
      image: (product.images && product.images.length > 0) ? product.images[0] : (product.image_url || ""),
      price: product.price,
      quantity: 1,
      stock: live ?? (product.stock || 9999),
      category_id: product.category_id ?? undefined,
    });
    setAddedId(product.id);
    setTimeout(() => setAddedId(null), 1200);
    if (product.category_id) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        await checkGiftRules(product.category_id, cartId, user?.id);
      } catch { /* kritik değil */ }
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "#FCFAF6" }}>
      <Navbar />

      {/* Tek, SEO-odaklı H1 (görünmez) — hero başlıkları h2; sayfada tek h1 kalır */}
      <h1 className="sr-only">YeriHisset — Doğal Barefoot Ayakkabılar: Geniş Burun, Sıfır Topuk Farkı</h1>

      {/* Mobil: app-benzeri ana sayfa */}
      <MobileHome products={products} />

      {/* Masaüstü: DESIGN.md ana sayfa (kendi footer'ıyla) */}
      <div className="hidden md:block">
        <DesktopHome products={products} loading={false} onQuickAdd={handleQuickAdd} addedId={addedId} />
      </div>

      {stockMsg && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md p-4 bg-white border-2 border-red-200 rounded-2xl shadow-2xl text-sm font-bold text-red-700 text-center">
          {stockMsg}
        </div>
      )}
    </div>
  );
}
