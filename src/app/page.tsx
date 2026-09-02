"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ShoppingBag, Search, ChevronRight, Star, ArrowRight, Shield, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useCartStore } from "@/store/useCartStore";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import WelcomeFunnel from "@/components/WelcomeFunnel";
import { formatPriceDisplay, getMinPrice } from "@/lib/product-price";

export default function HomePage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<Record<string, string>>({});
  const [bentoImages, setBentoImages] = useState<{ babet: string; bot: string; sneaker: string }>({
    babet: "", bot: "", sneaker: "",
  });
  const { addItem, checkGiftRules } = useCartStore();
  const [mounted, setMounted] = useState(false);
  const [addedId, setAddedId] = useState<string | null>(null); // Sepete ekleme animasyonu

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

    // Bedelsiz ürün kontrolü
    if (product.category_id) {
      const { data: { user } } = await supabase.auth.getUser();
      await checkGiftRules(product.category_id, cartId, user?.id);
    }
  }

  // İçerik için varsayılan değerler (DB'den gelmezse kullanılır)
  function c(key: string, fallback: string): string {
    return content[key] !== undefined && content[key] !== "" ? content[key] : fallback;
  }

  useEffect(() => {
    setMounted(true);
    fetchFeaturedProducts();
    fetchContent();
    fetchBentoImages();
  }, []);

  async function fetchContent() {
    try {
      const { data, error } = await supabase
        .from("site_content")
        .select("key, value")
        .eq("page", "home");
      if (error || !data) return; // hata varsa hardcoded fallback'ler kullanılır
      const map: Record<string, string> = {};
      data.forEach((r: any) => { map[r.key] = r.value ?? ""; });
      setContent(map);
    } catch {
      // tablo henüz hazır değilse sayfa yine de çalışır
    }
  }

  async function fetchBentoImages() {
    // Ürün başlığına göre kategori kartları için ilk fotoğrafı çek
    const keywords = ["babet", "bot", "sneaker"];
    const results: Record<string, string> = { babet: "", bot: "", sneaker: "" };
    for (const kw of keywords) {
      const { data } = await supabase
        .from("products")
        .select("images, image_url")
        .ilike("title", `%${kw}%`)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (data) {
        results[kw] = (data.images && data.images.length > 0) ? data.images[0] : (data.image_url || "");
      }
    }
    // Boş kalanlar için herhangi bir ürün görseli kullan
    const { data: fallback } = await supabase
      .from("products")
      .select("images, image_url")
      .eq("is_active", true)
      .not("images", "eq", "{}")
      .limit(3);
    const fbList = (fallback || []).map((p: any) =>
      (p.images && p.images.length > 0) ? p.images[0] : (p.image_url || "")
    ).filter(Boolean);
    if (!results.babet && fbList[0]) results.babet = fbList[0];
    if (!results.bot   && fbList[1]) results.bot   = fbList[1];
    if (!results.sneaker && fbList[2]) results.sneaker = fbList[2];
    setBentoImages(results);
  }

  async function fetchFeaturedProducts() {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, brands(name), categories(name), product_variants(price, is_active)')
        .eq('is_active', true)
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
    <div className="min-h-screen bg-cream">
      <WelcomeFunnel />
      {/* Top Bar for Admin Link (Geliştirme Süreci İçin) */}
      <div className="bg-slate-900 text-white py-2 px-4 text-xs font-black uppercase tracking-widest flex justify-between items-center z-[60] relative">
        <span>Geliştirme Modu Aktif</span>
        <Link href="/admin" className="flex items-center gap-1 hover:text-blue-400 transition-colors bg-white/10 px-3 h-6 rounded-full">
          <Shield size={12} /> Admin
        </Link>
      </div>

      <Navbar />

      <main>
        {/* Hero Section */}
        <section className="relative min-h-[700px] flex items-center overflow-hidden bg-cream pt-12">
          <div className="absolute top-0 right-0 w-1/2 h-full bg-olive-50/50 rounded-l-[10rem] -z-10 hidden lg:block animate-in slide-in-from-right duration-1000" />
          <div className="container mx-auto px-4 grid lg:grid-cols-2 gap-12 items-center relative z-10">
            <div className="space-y-8 animate-in fade-in slide-in-from-left duration-700">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-olive-50 text-olive-600 text-xs font-black rounded-full uppercase tracking-tighter border border-olive-100">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-olive-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-olive-600"></span>
                </span>
                {c("badge", "Yeni Sezon Yayında")}
              </div>
              <h1 className="text-6xl md:text-8xl font-black leading-[0.9] text-slate-900 tracking-tighter">
                <span>{c("title_line1", "Ayağını")}</span><br />
                <span className="text-olive-600 italic">{c("title_line2", "Özgürleştir.")}</span><br />
                <span>{c("title_line3", "Barefoot.")}</span>
              </h1>
              <p className="text-xl text-slate-500 max-w-lg leading-relaxed font-medium">
                {c("subtitle", "Geniş burun bölgesi, sıfır topuk yüksekliği. Ayaklarını doğal yapısına kavuştur.")}
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Button size="lg" className="bg-olive-600 hover:bg-blue-700 h-16 px-10 text-lg font-black shadow-2xl shadow-olive-100 rounded-2xl btn-juice">
                  {c("cta_primary", "ALIŞVERİŞE BAŞLA")}
                </Button>
                <Link href="#" className="flex items-center gap-3 font-bold text-slate-900 group hover:text-olive-600 transition-colors px-4 py-2">
                  {c("cta_secondary", "Koleksiyonları Gör")} <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform" />
                </Link>
              </div>

              <div className="pt-8 flex items-center gap-8 border-t border-slate-100 max-w-md">
                <div>
                  <p className="text-2xl font-black text-slate-900 italic">{c("stat1_value", "5k+")}</p>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{c("stat1_label", "Mutlu Ayak")}</p>
                </div>
                <Separator orientation="vertical" className="h-10" />
                <div>
                  <p className="text-2xl font-black text-slate-900 italic">{c("stat2_value", "30+")}</p>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{c("stat2_label", "Barefoot Model")}</p>
                </div>
              </div>
            </div>
            <div className="relative animate-in fade-in zoom-in duration-1000">
               <div className="absolute -top-20 -right-20 w-[600px] h-[600px] bg-olive-100 rounded-full blur-[100px] opacity-30" />
               <div className="relative z-10 p-4 bg-white rounded-[3rem] shadow-2xl shadow-slate-200 border border-slate-100 transform rotate-3 hover:rotate-0 transition-transform duration-700 animate-float">
                 {/* eslint-disable-next-line @next/next/no-img-element */}
                 <img
                  src={c("image", "https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?q=80&w=1200")}
                  alt="Hero Product"
                  className="w-full h-auto rounded-[2.5rem] object-cover"
                 />
                 <div className="absolute -bottom-10 -left-10 glass p-6 rounded-3xl shadow-xl border-white animate-in slide-in-from-bottom-10 duration-1000 hidden md:block">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-olive-600 flex items-center justify-center text-white font-bold text-xl uppercase italic shadow-lg shadow-olive-100">Y</div>
                      <div>
                        <p className="text-sm font-black text-slate-900 leading-none">{c("card_title", "Barefoot Babet")}</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{c("card_badge", "Sınırlı Stok")}</p>
                      </div>
                   </div>
                 </div>
               </div>
            </div>
          </div>
        </section>

        {/* Bento Discovery Section */}
        <section className="py-24 bg-olive-50">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
              <div className="space-y-4">
                <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter italic uppercase underline decoration-olive-600 decoration-4 underline-offset-8">Kategorileri Keşfedin</h2>
                <p className="text-slate-500 font-medium max-w-md">Ayaklarınıza özgürlük veren barefoot koleksiyonlarımızı keşfedin.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* Büyük kart — Barefoot Babet */}
              <div className="md:col-span-2 md:row-span-2 bento-card bg-slate-900 group">
                <div className="absolute bottom-0 right-0 w-full h-full opacity-50 transition-opacity group-hover:opacity-70 bg-gradient-to-t from-slate-950 to-transparent z-10" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={bentoImages.babet || "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=800"}
                  alt="Barefoot Babet"
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000"
                />
                <div className="relative z-20 h-full flex flex-col justify-end gap-4">
                  <Badge className="w-fit bg-olive-600 text-white border-none font-black text-[10px] uppercase tracking-widest px-3 py-1">En Popüler</Badge>
                  <h3 className="text-4xl font-black text-white italic tracking-tighter uppercase leading-none">Barefoot <br /> Babet</h3>
                  <Link href="/products" className="flex items-center gap-2 text-white font-bold text-sm bg-white/10 hover:bg-white/20 backdrop-blur-md w-fit px-6 h-12 rounded-2xl transition-all border border-white/20">
                    İncele <ArrowRight size={18} />
                  </Link>
                </div>
              </div>

              {/* Küçük kart — Bot */}
              <div className="bento-card group overflow-hidden">
                {bentoImages.bot ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={bentoImages.bot}
                      alt="Barefoot Bot"
                      className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-30 group-hover:scale-110 transition-all duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-white/80 to-transparent" />
                  </>
                ) : null}
                <div className="relative space-y-4">
                  <div className="w-14 h-14 bg-olive-50 rounded-2xl flex items-center justify-center text-olive-600 group-hover:bg-olive-600 group-hover:text-white transition-colors duration-500">
                    <ShoppingBag size={28} />
                  </div>
                  <h4 className="text-2xl font-black text-slate-900 uppercase italic">Barefoot Bot</h4>
                  <p className="text-xs font-medium text-slate-500 leading-relaxed uppercase tracking-widest">Kış • Doğal Yürüyüş</p>
                </div>
              </div>

              {/* Küçük kart — Sneaker / Günlük */}
              <div className="bento-card group overflow-hidden">
                {bentoImages.sneaker ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={bentoImages.sneaker}
                      alt="Barefoot Sneaker"
                      className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-30 group-hover:scale-110 transition-all duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-white/80 to-transparent" />
                  </>
                ) : null}
                <div className="relative space-y-4">
                  <div className="w-14 h-14 bg-olive-50 rounded-2xl flex items-center justify-center text-olive-600 group-hover:bg-olive-600 group-hover:text-white transition-colors duration-500">
                    <Star size={28} />
                  </div>
                  <h4 className="text-2xl font-black text-slate-900 uppercase italic">Günlük Sneaker</h4>
                  <p className="text-xs font-medium text-slate-500 leading-relaxed uppercase tracking-widest">Her Zemin • Esnek Taban</p>
                </div>
              </div>

              {/* Geniş kart — Tüm Koleksiyon */}
              <div className="md:col-span-2 bento-card bg-white flex items-center justify-between gap-8 group">
                <div className="space-y-4 flex-1">
                  <h4 className="text-3xl font-black text-slate-900 uppercase italic leading-none">Barefoot <br /> Ayakkabı</h4>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">Geniş Burun • Sıfır Topuk • Hafif Taban</p>
                  <Link href="/products">
                    <Button variant="outline" className="rounded-2xl h-12 font-black uppercase text-[10px] tracking-widest border-2">Tümünü İncele</Button>
                  </Link>
                </div>
                <div className="w-1/3 aspect-square bg-slate-50 rounded-[2rem] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={bentoImages.babet || bentoImages.bot || "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=400"}
                    alt="Barefoot Koleksiyon"
                    className="w-full h-full object-cover group-hover:scale-125 transition-transform duration-700"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Featured Products */}
        <section className="py-24 container mx-auto px-4">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-20 text-center md:text-left">
            <div className="space-y-2">
              <span className="text-olive-600 font-black text-[10px] uppercase tracking-[0.2em] px-1 italic">Haftanın Yıldızları</span>
              <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter uppercase italic">Sizin İçin Seçtiklerimiz</h2>
            </div>
            <Link href="#" className="inline-flex items-center gap-3 font-black text-slate-900 group hover:text-olive-600 transition-colors uppercase tracking-tight italic border-b-4 border-olive-100 pb-2">
              Tüm Ürünleri Gör <ChevronRight size={24} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-12">
               {[1,2,3,4].map(i => (
                 <div key={i} className="space-y-6 animate-pulse">
                    <div className="aspect-[3/4] bg-slate-100 rounded-[2.5rem]" />
                    <div className="h-4 bg-slate-100 rounded w-2/3" />
                    <div className="h-4 bg-slate-100 rounded w-1/3" />
                 </div>
               ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-16">
              {products.map((product) => (
                <div key={product.id} className="group cursor-pointer">
                   <div className="relative aspect-[3/4] overflow-hidden rounded-[2.5rem] bg-olive-50 mb-6 border border-slate-100 shadow-sm transition-all duration-700 hover:shadow-2xl hover:shadow-slate-200">
                      <Link href={`/products/${product.slug}`} className="block w-full h-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={(product.images && product.images.length > 0) ? product.images[0] : (product.image_url || "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?q=80&w=400")} 
                          alt={product.title}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000"
                        />
                      </Link>
                      {product.has_variants ? (
                        /* Varyantlı ürün → ürün sayfasına yönlendir */
                        <Link
                          href={`/products/${product.slug}`}
                          className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[85%] h-14 glass rounded-2xl text-slate-900 font-black text-xs uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all transform translate-y-4 group-hover:translate-y-0 flex items-center justify-center gap-2 hover:bg-olive-600 hover:text-white hover:border-olive-600 active:scale-95 shadow-xl"
                        >
                          <Search size={18} /> İNCELE
                        </Link>
                      ) : (
                        /* Varyantsız ürün → direkt sepete ekle */
                        <button
                          onClick={(e) => { e.preventDefault(); handleQuickAdd(product); }}
                          className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[85%] h-14 glass rounded-2xl font-black text-xs uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all transform translate-y-4 group-hover:translate-y-0 flex items-center justify-center gap-2 active:scale-95 shadow-xl hover:border-olive-600"
                          style={addedId === product.id
                            ? { background: "#536430", color: "#fff", opacity: 1, transform: "translateY(0)" }
                            : { color: "#1a1c19" }}
                        >
                          {addedId === product.id
                            ? <><Check size={18} /> EKLENDİ</>
                            : <><ShoppingBag size={18} /> SEPETE EKLE</>}
                        </button>
                      )}
                      <div className="absolute top-6 left-6 flex flex-col gap-2">
                         <span className="px-3 py-1 bg-white/90 backdrop-blur-md text-[9px] font-black uppercase tracking-widest rounded-full border border-slate-100 text-slate-900">
                            {product.brands?.name || "Özel"}
                         </span>
                         {getMinPrice(product) > 1000 && (
                            <span className="px-3 py-1 bg-olive-600 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-olive-100">
                               Ücretsiz Kargo
                            </span>
                         )}
                      </div>
                   </div>
                   <div className="space-y-1 px-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.1em]">{product.categories?.name}</p>
                        <div className="flex items-center gap-1 text-yellow-400">
                            <Star size={10} fill="currentColor" />
                            <span className="text-[10px] text-slate-500 font-bold italic">4.9 (124+)</span>
                        </div>
                      </div>
                      <Link href={`/products/${product.slug}`}>
                        <h3 className="text-lg font-black text-slate-900 group-hover:text-olive-600 transition-colors tracking-tight uppercase italic">{product.title}</h3>
                      </Link>
                      <p className="font-black text-2xl text-olive-600 italic tracking-tighter">{formatPriceDisplay(product)}</p>
                   </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Benefits Section */}
        <section className="bg-cream py-32 border-t border-olive-100">
          <div className="container mx-auto px-4 grid grid-cols-1 sm:grid-cols-3 gap-16 text-center">
            <div className="space-y-6 group">
              <div className="w-24 h-24 bg-olive-50 rounded-[2.5rem] flex items-center justify-center mx-auto text-olive-600 group-hover:bg-olive-600 group-hover:text-white transition-all duration-700 transform group-hover:rotate-6">
                 <ShoppingBag size={36} />
              </div>
              <h4 className="text-2xl font-black text-slate-900 uppercase italic">Hızlı Teslimat</h4>
              <p className="text-slate-500 font-medium leading-relaxed">Siparişiniz özenle paketlenerek 24 saat içinde kargoya verilir.</p>
            </div>
            <div className="space-y-6 group">
              <div className="w-24 h-24 bg-olive-50 rounded-[2.5rem] flex items-center justify-center mx-auto text-olive-600 group-hover:bg-olive-600 group-hover:text-white transition-all duration-700 transform group-hover:-rotate-6">
                 <Shield size={36} />
              </div>
              <h4 className="text-2xl font-black text-slate-900 uppercase italic">Doğal Kalıp</h4>
              <p className="text-slate-500 font-medium leading-relaxed">Geniş burun bölgesi ve sıfır topuk yüksekliği ile ayağınızın doğal şekline uyar.</p>
            </div>
            <div className="space-y-6 group">
              <div className="w-24 h-24 bg-olive-50 rounded-[2.5rem] flex items-center justify-center mx-auto text-olive-600 group-hover:bg-olive-600 group-hover:text-white transition-all duration-700 transform group-hover:rotate-12">
                 <ArrowRight className="rotate-180" size={36} />
              </div>
              <h4 className="text-2xl font-black text-slate-900 uppercase italic">Kolay İade</h4>
              <p className="text-slate-500 font-medium leading-relaxed">Beden uymazsa koşulsuz 14 gün içinde ücretsiz iade ve değişim.</p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
