"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useCartStore } from "@/store/useCartStore";
import Navbar from "@/components/Navbar";
import MobileHome from "@/components/MobileHome";
import DesktopHome from "@/components/DesktopHome";

export default function HomePage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addedId, setAddedId] = useState<string | null>(null); // Sepete ekleme animasyonu
  const { addItem, checkGiftRules } = useCartStore();

  // Varyantsız ürünü tek tıkla sepete ekle (öne çıkan kartlar)
  async function handleQuickAdd(product: any) {
    const cartId = `prod_${product.id}`;
    addItem({
      id: cartId,
      product_id: product.id,
      title: product.title,
      image: (product.images && product.images.length > 0) ? product.images[0] : (product.image_url || ""),
      price: product.price,
      quantity: 1,
      stock: product.stock || 9999,
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

  useEffect(() => { fetchFeaturedProducts(); }, []);

  async function fetchFeaturedProducts() {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*, brands(name), categories(name), product_variants(price, is_active)")
        .eq("is_active", true)
        .limit(8);
      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error("Error fetching homepage products:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "#FCFAF6" }}>
      <Navbar />

      {/* Mobil: app-benzeri ana sayfa */}
      <MobileHome products={products} />

      {/* Masaüstü: DESIGN.md ana sayfa (kendi footer'ıyla) */}
      <div className="hidden md:block">
        <DesktopHome products={products} loading={loading} onQuickAdd={handleQuickAdd} addedId={addedId} />
      </div>
    </div>
  );
}
