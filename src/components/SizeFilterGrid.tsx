"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { qualifiesFreeShipping } from "@/lib/free-shipping-rule";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, PackageX, Bell, ShoppingBag } from "lucide-react";
import { formatPriceDisplay, getMinPrice } from "@/lib/product-price";
import { compareVariantValues } from "@/lib/variant-sort";
import StockNotifyModal from "@/components/products/StockNotifyModal";
import { useCartStore } from "@/store/useCartStore";
import { supabase } from "@/lib/supabase";
import { track } from "@/lib/track";
import { fetchLiveStocks, fetchItemStock } from "@/lib/live-stock";

const FALLBACK_IMG = "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?q=80&w=400";

// Bir varyant "numara" mı? Grup adı Numara/Beden ise ya da değer sayısal ise.
function isSizeVariant(v: any): boolean {
  const gn = (v.variant_options?.variant_groups?.name ?? "").toLocaleLowerCase("tr-TR");
  const val = (v.variant_options?.value ?? "").trim();
  if (/numara|beden|no\b/.test(gn)) return true;
  return /^\d{2}([.,]\d)?$/.test(val); // 36, 38, 39.5 gibi
}
function sizeValue(v: any): string {
  return (v.variant_options?.value ?? "").trim();
}

function ProductCard({ product, categoryName, size, outOfStock, onNotify, canQuickBuy, onQuickBuy, priority, freeOver, hasGift }: {
  product: any;
  categoryName?: string;
  size?: string | null;          // aktif numara filtresi (varsa linke eklenir)
  outOfStock?: boolean;          // bu numara stokta değil → "Haber Ver" göster
  onNotify?: (product: any) => void;
  canQuickBuy?: boolean;         // bu numara stokta → "Hemen Sipariş Ver" göster
  onQuickBuy?: (product: any) => void;
  priority?: boolean;            // üst sıra kartları → görsel öncelikli yüklensin
  freeOver?: number | null;      // ücretsiz kargo eşiği (kargo ayarından)
  hasGift?: boolean;             // kategorisi bir hediye kuralını tetikliyor
}) {
  const img = product.images?.[0] ?? product.image_url ?? FALLBACK_IMG;
  const minPrice = getMinPrice(product);
  const priceText = formatPriceDisplay(product);
  const brand = product.brands as any;
  // Numara filtresi aktifse ürün sayfası o numarayı önseçsin
  const href = size ? `/products/${product.slug}?beden=${encodeURIComponent(size)}` : `/products/${product.slug}`;
  return (
    <div className="group cursor-pointer">
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl md:rounded-[2.5rem] bg-olive-50 mb-3 md:mb-6 border border-slate-100 shadow-sm transition-all duration-700 hover:shadow-2xl hover:shadow-slate-200">
        <Link href={href} className="block w-full h-full relative">
          <Image src={img} alt={product.title} fill priority={priority} loading={priority ? undefined : "eager"} sizes="(max-width: 768px) 50vw, 25vw" className="object-cover group-hover:scale-110 transition-transform duration-1000" />
        </Link>
        {outOfStock && onNotify ? (
          /* Stokta olmayan (numara filtresi) — kalıcı aksiyonlar: Haber Ver (birincil) + İncele (ikincil) */
          <div className="absolute bottom-2.5 md:bottom-5 left-1/2 -translate-x-1/2 w-[92%] md:w-[88%] flex flex-col gap-1.5 md:gap-2">
            <button
              onClick={(e) => { e.preventDefault(); onNotify(product); }}
              className="h-10 md:h-12 rounded-xl md:rounded-2xl bg-olive-600 text-white font-black text-[10px] md:text-xs uppercase tracking-wide md:tracking-widest flex items-center justify-center gap-1.5 md:gap-2 text-center leading-tight px-1 hover:bg-olive-700 active:scale-95 shadow-xl shadow-olive-900/10"
            >
              <Bell size={16} /> Stoğa Girince Haber Ver
            </button>
            <Link href={href}
              className="h-8 md:h-10 rounded-xl md:rounded-2xl glass text-slate-700 font-black text-[10px] md:text-[11px] uppercase tracking-wide md:tracking-widest flex items-center justify-center gap-1.5 md:gap-2 hover:bg-white active:scale-95">
              <Search size={14} /> İncele
            </Link>
          </div>
        ) : canQuickBuy && onQuickBuy ? (
          /* Stokta (numara filtresi) — Hemen Sipariş Ver (birincil) + İncele (ikincil) */
          <div className="absolute bottom-2.5 md:bottom-5 left-1/2 -translate-x-1/2 w-[92%] md:w-[88%] flex flex-col gap-1.5 md:gap-2">
            <button
              onClick={(e) => { e.preventDefault(); onQuickBuy(product); }}
              className="h-10 md:h-12 rounded-xl md:rounded-2xl bg-olive-600 text-white font-black text-[10px] md:text-xs uppercase tracking-wide md:tracking-widest flex items-center justify-center gap-1.5 md:gap-2 text-center leading-tight px-1 hover:bg-olive-700 active:scale-95 shadow-xl shadow-olive-900/10"
            >
              <ShoppingBag size={16} /> Hemen Sipariş Ver
            </button>
            <Link href={href}
              className="h-8 md:h-10 rounded-xl md:rounded-2xl glass text-slate-700 font-black text-[10px] md:text-[11px] uppercase tracking-wide md:tracking-widest flex items-center justify-center gap-1.5 md:gap-2 hover:bg-white active:scale-95">
              <Search size={14} /> İncele
            </Link>
          </div>
        ) : (
          <Link href={href}
            className="absolute bottom-2.5 md:bottom-6 left-1/2 -translate-x-1/2 w-[90%] md:w-[85%] h-10 md:h-14 glass rounded-xl md:rounded-2xl text-slate-900 font-black text-[11px] md:text-xs uppercase tracking-wide md:tracking-widest transition-all flex items-center justify-center gap-2 hover:bg-olive-600 hover:text-white hover:border-olive-600 active:scale-95 shadow-xl opacity-100 translate-y-0 md:opacity-0 md:translate-y-4 md:group-hover:opacity-100 md:group-hover:translate-y-0">
            <Search size={18} /> İNCELE
          </Link>
        )}
        <div className="absolute top-2.5 left-2.5 md:top-6 md:left-6 flex flex-col items-start gap-1 md:gap-2">
          {brand?.name && (
            <span className="px-2 md:px-3 py-0.5 md:py-1 bg-white/90 backdrop-blur-md text-[9px] font-black uppercase tracking-widest rounded-full border border-slate-100 text-slate-900">{brand.name}</span>
          )}
          {hasGift && (
            <span className="px-2 md:px-3 py-0.5 md:py-1 bg-amber-400 text-slate-900 text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg">🎁 Hediyeli</span>
          )}
          {qualifiesFreeShipping(minPrice, freeOver) && (
            <span className="px-2 md:px-3 py-0.5 md:py-1 bg-olive-600 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-olive-100">Ücretsiz Kargo</span>
          )}
        </div>
      </div>
      <div className="space-y-1 px-1 md:px-2">
        <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.1em]">{categoryName ?? ""}</p>
        <Link href={href}>
          <h3 className="text-[13px] leading-snug md:text-lg md:leading-normal font-black text-slate-900 group-hover:text-olive-600 transition-colors tracking-tight uppercase italic">{product.title}</h3>
        </Link>
        <p className="font-black text-lg md:text-2xl text-olive-600 italic tracking-tighter">{priceText}</p>
      </div>
    </div>
  );
}

export default function SizeFilterGrid({ products: cachedProducts, categoryName, freeOver = null }: { products: any[]; categoryName?: string; freeOver?: number | null }) {
  // Sayfa ISR ile önbellekli → stok birkaç dk eski olabilir. Açılışta ve sekmeye
  // dönüşte varyant stokları DB'den okunup ürünlerin üstüne yazılır; böylece numara
  // filtresi "stokta" / "stokta değil" ayrımını güncel stokla yapar.
  const [liveVariants, setLiveVariants] = useState<Map<string, number> | null>(null);
  // Hediye kuralı tetikleyen kategoriler → kartta "Hediyeli" rozeti
  const [giftCats, setGiftCats] = useState<Set<string>>(new Set());
  useEffect(() => {
    (supabase as any).from("free_gift_rules").select("trigger_category_id").eq("is_active", true)
      .then(({ data }: any) => setGiftCats(new Set(((data as any[]) ?? []).map((r) => r.trigger_category_id))));
  }, []);
  const [stockMsg, setStockMsg] = useState<string | null>(null);
  const productIdsKey = cachedProducts.map((p) => p.id).join(",");
  useEffect(() => {
    let active = true;
    const refresh = () =>
      fetchLiveStocks(cachedProducts.map((p) => p.id))
        .then((s) => { if (active) setLiveVariants(s.variants); })
        .catch(() => {});
    refresh();
    const onShow = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("pageshow", onShow);
    return () => { active = false; document.removeEventListener("visibilitychange", onShow); window.removeEventListener("pageshow", onShow); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productIdsKey]);
  const products = useMemo(() => {
    if (!liveVariants) return cachedProducts;
    return cachedProducts.map((p) => ({
      ...p,
      product_variants: (p.product_variants ?? []).map((v: any) =>
        liveVariants.has(v.id) ? { ...v, stock: liveVariants.get(v.id) } : v
      ),
    }));
  }, [cachedProducts, liveVariants]);

  const [size, setSize] = useState<string | null>(null);
  const [cat, setCat] = useState<string | null>(null); // seçili kategori id'si
  const [brand, setBrand] = useState<string | null>(null); // seçili marka slug'ı
  // "Haber Ver" modalı hedefi (stokta olmayan kart tıklanınca)
  const [notifyTarget, setNotifyTarget] = useState<{ productId: string; productTitle: string; variantId?: string; variantName?: string } | null>(null);

  const router = useRouter();
  const { addItem, checkGiftRules } = useCartStore();

  // "Hemen Sipariş Ver" — seçili numaranın stoktaki varyantını sepete at, /sepet'e git
  async function quickBuy(product: any) {
    const v = (product.product_variants ?? []).find((x: any) => isSizeVariant(x) && sizeValue(x) === size && Number(x.stock ?? 0) > 0);
    if (!v) { router.push(`/products/${product.slug}?beden=${encodeURIComponent(size ?? "")}`); return; }
    // Sepete atmadan önce güncel stok: tükendiyse kartı "stokta değil"e taşı + uyar
    setStockMsg(null);
    const live = await fetchItemStock(product.id, v.id);
    const inCart = useCartStore.getState().items.find((i) => i.id === `var_${v.id}`)?.quantity ?? 0;
    if (live !== null) {
      setLiveVariants((prev) => new Map(prev ?? []).set(v.id, live));
      if (live - inCart <= 0) {
        setStockMsg(live <= 0
          ? `${product.title} — ${sizeValue(v)} numara az önce tükendi. Stoğa girince haber verebiliriz.`
          : `${product.title} — ${sizeValue(v)} numaranın stoktaki son ${live} adedi zaten sepetinde.`);
        return;
      }
    }
    const price = Number(v.price) || getMinPrice(product) || product.price || 0;
    addItem({
      id: `var_${v.id}`,
      product_id: product.id,
      variant_id: v.id,
      title: product.title,
      image: product.images?.[0] ?? product.image_url ?? FALLBACK_IMG,
      price,
      quantity: 1,
      stock: live ?? Number(v.stock ?? 0),
      variant_name: sizeValue(v),
      category_id: product.categories?.id,
    });
    track("quick_buy", { product_id: product.id, variant_id: v.id, size: sizeValue(v), price });
    // Ödül/bedelsiz ürün kuralları — ürün sayfasıyla aynı tetikleme
    if (product.categories?.id) {
      try { const { data: { user } } = await supabase.auth.getUser(); await checkGiftRules(product.categories.id, `var_${v.id}`, user?.id); } catch { /* kritik değil */ }
    }
    router.push("/sepet");
  }

  // Stokta olmayan bir kart için "Haber Ver" — o numaranın varyantını bulup modalı aç
  function openNotify(product: any) {
    const v = (product.product_variants ?? []).find((x: any) => isSizeVariant(x) && sizeValue(x) === size);
    setNotifyTarget({
      productId: product.id,
      productTitle: product.title,
      variantId: v?.id,
      variantName: v ? sizeValue(v) : (size ?? undefined),
    });
  }

  // URL'de ?kategori=<slug> varsa (ör. funnel'dan gelen) o kategori önseçili
  // açılır — kullanıcı yine tüm kategoriler arasında gezebilir. Hydration
  // uyuşmazlığı olmasın diye mount sonrası uygulanır.
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("kategori");
    if (!slug) return;
    const match = products.find((p: any) => p.categories?.slug === slug);
    if (match?.categories?.id) setCat(match.categories.id);
  }, [products]);

  // ?marka=<slug> varsa o marka önseçili açılır (kategori ile aynı mantık)
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("marka");
    if (slug && products.some((p: any) => p.brands?.slug === slug)) setBrand(slug);
  }, [products]);

  // Mevcut markalar (ürünlerden). Tek marka varsa filtre o marka SEÇİLİ görünür
  // (bilgi amaçlı; süzme yapılmaz, markasız ürünler de listede kalır).
  const brands = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) {
      const b = p.brands;
      if (b?.slug && b?.name) m.set(b.slug, b.name);
    }
    return [...m.entries()].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [products]);
  const singleBrand = brands.length === 1;
  const activeBrand = singleBrand ? brands[0].slug : brand;

  // Mevcut kategoriler (yalnızca kategorisi olan ürünlerden). ≥2 ise filtre gösterilir.
  const cats = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) {
      const c = p.categories;
      if (c?.id && c?.name) m.set(c.id, c.name);
    }
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [products]);
  const showCatFilter = cats.length >= 2;

  // Marka + kategori süzgeci (numaradan bağımsız). Seçiliyse önce onlara indir.
  const base = useMemo(
    () => products.filter((p) =>
      (!brand || singleBrand || p.brands?.slug === brand) &&
      (!cat || p.categories?.id === cat)),
    [products, cat, brand, singleBrand]
  );

  // Mevcut numaralar (kategori süzgecinden sonra)
  const sizes = useMemo(() => {
    const set = new Set<string>();
    for (const p of base) {
      for (const v of p.product_variants ?? []) {
        if (isSizeVariant(v)) { const s = sizeValue(v); if (s) set.add(s); }
      }
    }
    return [...set].sort(compareVariantValues);
  }, [base]);

  // Seçilen numaraya göre ayrım (kategori süzgecinden sonra)
  const { inStock, outStock } = useMemo(() => {
    if (!size) return { inStock: base, outStock: [] as any[] };
    const inS: any[] = [];
    const outS: any[] = [];
    for (const p of base) {
      const sizeVars = (p.product_variants ?? []).filter((v: any) => isSizeVariant(v) && sizeValue(v) === size);
      if (sizeVars.length === 0) continue; // bu numara yok → gizle
      const hasStock = sizeVars.some((v: any) => Number(v.stock ?? 0) > 0);
      (hasStock ? inS : outS).push(p);
    }
    return { inStock: inS, outStock: outS };
  }, [base, size]);

  // Telefon: 2 sütun (ziyaretçilerin ~%94'ü mobil — ilk ekranda ürün görünsün)
  const gridCls = "grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-8 sm:gap-x-6 md:gap-x-8 md:gap-y-16";

  return (
    <div className="space-y-4 md:space-y-8">
      {/* Marka filtresi (en üstte) — tek marka varsa o seçili gelir */}
      {brands.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto md:flex-wrap md:overflow-visible -mx-4 px-4 md:mx-0 md:px-0 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="text-xs font-black uppercase tracking-widest text-slate-400 mr-1 shrink-0">Marka:</span>
          {!singleBrand && (
            <button
              onClick={() => setBrand(null)}
              className={`shrink-0 px-4 h-9 rounded-xl text-sm font-bold border-2 transition-all ${activeBrand === null ? "border-olive-600 bg-olive-600 text-white" : "border-slate-200 text-slate-600 hover:border-olive-300"}`}
            >
              Hepsi
            </button>
          )}
          {brands.map((b) => (
            <button
              key={b.slug}
              onClick={() => {
                if (singleBrand) return;
                setBrand((prev) => (prev === b.slug ? null : b.slug));
                track("brand_click", { brand: b.slug, source: "filter" });
              }}
              className={`shrink-0 px-4 h-9 rounded-xl text-sm font-bold border-2 transition-all ${activeBrand === b.slug ? "border-olive-600 bg-olive-600 text-white" : "border-slate-200 text-slate-700 hover:border-olive-300"} ${singleBrand ? "cursor-default" : ""}`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* Kategori filtresi (numaranın üstünde) */}
      {showCatFilter && (
        <div className="flex items-center gap-2 overflow-x-auto md:flex-wrap md:overflow-visible -mx-4 px-4 md:mx-0 md:px-0 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="text-xs font-black uppercase tracking-widest text-slate-400 mr-1 shrink-0">Kategori:</span>
          <button
            onClick={() => setCat(null)}
            className={`shrink-0 px-4 h-9 rounded-xl text-sm font-bold border-2 transition-all ${cat === null ? "border-olive-600 bg-olive-600 text-white" : "border-slate-200 text-slate-600 hover:border-olive-300"}`}
          >
            Hepsi
          </button>
          {cats.map((c) => (
            <button
              key={c.id}
              onClick={() => { setCat((prev) => (prev === c.id ? null : c.id)); track("category_click", { category_id: c.id, category: c.name }); }}
              className={`shrink-0 px-4 h-9 rounded-xl text-sm font-bold border-2 transition-all ${cat === c.id ? "border-olive-600 bg-olive-600 text-white" : "border-slate-200 text-slate-700 hover:border-olive-300"}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Numara filtresi */}
      {sizes.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto md:flex-wrap md:overflow-visible -mx-4 px-4 md:mx-0 md:px-0 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="text-xs font-black uppercase tracking-widest text-slate-400 mr-1 shrink-0">Numara:</span>
          <button
            onClick={() => setSize(null)}
            className={`shrink-0 px-3 h-9 rounded-xl text-sm font-bold border-2 transition-all ${size === null ? "border-olive-600 bg-olive-600 text-white" : "border-slate-200 text-slate-600 hover:border-olive-300"}`}
          >
            Hepsi
          </button>
          {sizes.map((s) => (
            <button
              key={s}
              onClick={() => { setSize(s); track("size_filter", { size: s, category: categoryName }); }}
              className={`shrink-0 min-w-[44px] h-9 px-2 rounded-xl text-sm font-bold border-2 transition-all ${size === s ? "border-olive-600 bg-olive-600 text-white" : "border-slate-200 text-slate-700 hover:border-olive-300"}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Sonuç */}
      {!size ? (
        base.length === 0 ? (
          <div className="text-center py-20 text-slate-400">Bu kategoride henüz ürün bulunmuyor.</div>
        ) : (
          <div className={gridCls}>
            {base.map((p, i) => <ProductCard key={p.id} freeOver={freeOver} hasGift={giftCats.has(p.categories?.id)} product={p} categoryName={categoryName} size={size} priority={i < 4} />)}
          </div>
        )
      ) : (
        <div className="space-y-12">
          {/* Stokta olanlar */}
          <div>
            <div className="flex items-center gap-2 mb-6">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <h2 className="text-lg font-black text-slate-900 uppercase italic">{size} Numara — Stokta ({inStock.length})</h2>
            </div>
            {inStock.length === 0 ? (
              <p className="text-slate-400 text-sm py-4">Bu numarada stokta ürün yok.</p>
            ) : (
              <div className={gridCls}>{inStock.map((p, i) => <ProductCard key={p.id} freeOver={freeOver} hasGift={giftCats.has(p.categories?.id)} product={p} categoryName={categoryName} size={size} canQuickBuy onQuickBuy={quickBuy} priority={i < 4} />)}</div>
            )}
          </div>

          {/* Stokta olmayanlar */}
          {outStock.length > 0 && (
            <div className="pt-4 border-t border-dashed border-slate-200">
              <div className="flex items-center gap-2 mb-6">
                <PackageX size={16} className="text-slate-400" />
                <h2 className="text-lg font-black text-slate-400 uppercase italic">{size} Numara — Şu An Stokta Değil ({outStock.length})</h2>
              </div>
              <div className={gridCls}>
                {outStock.map((p) => <ProductCard key={p.id} freeOver={freeOver} hasGift={giftCats.has(p.categories?.id)} product={p} categoryName={categoryName} size={size} outOfStock onNotify={openNotify} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stok uyarısı (hızlı satın almada ürün az önce tükendiyse) */}
      {stockMsg && (
        <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md flex items-start gap-3 p-4 bg-white border-2 border-red-200 rounded-2xl shadow-2xl text-sm font-bold text-red-700">
          <PackageX size={18} className="shrink-0 mt-0.5" />
          <span className="flex-1">{stockMsg}</span>
          <button onClick={() => setStockMsg(null)} className="text-slate-400 hover:text-slate-700 font-black" aria-label="Kapat">✕</button>
        </div>
      )}

      {/* Stoğa girince haber ver — kart üstünden açılır */}
      <StockNotifyModal
        open={!!notifyTarget}
        onClose={() => setNotifyTarget(null)}
        onSuccess={() => setNotifyTarget(null)}
        productId={notifyTarget?.productId ?? ""}
        productTitle={notifyTarget?.productTitle ?? ""}
        variantId={notifyTarget?.variantId}
        variantName={notifyTarget?.variantName}
      />
    </div>
  );
}
