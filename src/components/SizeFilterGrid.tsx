"use client";

/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Star, PackageX } from "lucide-react";
import { formatPriceDisplay, getMinPrice } from "@/lib/product-price";

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

function ProductCard({ product, categoryName }: { product: any; categoryName?: string }) {
  const img = product.images?.[0] ?? product.image_url ?? FALLBACK_IMG;
  const minPrice = getMinPrice(product);
  const priceText = formatPriceDisplay(product);
  const brand = product.brands as any;
  return (
    <div className="group cursor-pointer">
      <div className="relative aspect-[3/4] overflow-hidden rounded-[2.5rem] bg-olive-50 mb-6 border border-slate-100 shadow-sm transition-all duration-700 hover:shadow-2xl hover:shadow-slate-200">
        <Link href={`/products/${product.slug}`} className="block w-full h-full">
          <img src={img} alt={product.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" />
        </Link>
        <Link href={`/products/${product.slug}`}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[85%] h-14 glass rounded-2xl text-slate-900 font-black text-xs uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all transform translate-y-4 group-hover:translate-y-0 flex items-center justify-center gap-2 hover:bg-olive-600 hover:text-white hover:border-olive-600 active:scale-95 shadow-xl">
          <Search size={18} /> İNCELE
        </Link>
        <div className="absolute top-6 left-6 flex flex-col gap-2">
          {brand?.name && (
            <span className="px-3 py-1 bg-white/90 backdrop-blur-md text-[9px] font-black uppercase tracking-widest rounded-full border border-slate-100 text-slate-900">{brand.name}</span>
          )}
          {minPrice > 1000 && (
            <span className="px-3 py-1 bg-olive-600 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-olive-100">Ücretsiz Kargo</span>
          )}
        </div>
      </div>
      <div className="space-y-1 px-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.1em]">{categoryName ?? ""}</p>
          <div className="flex items-center gap-1 text-yellow-400">
            <Star size={10} fill="currentColor" />
            <span className="text-[10px] text-slate-500 font-bold italic">4.9 (124+)</span>
          </div>
        </div>
        <Link href={`/products/${product.slug}`}>
          <h3 className="text-lg font-black text-slate-900 group-hover:text-olive-600 transition-colors tracking-tight uppercase italic">{product.title}</h3>
        </Link>
        <p className="font-black text-2xl text-olive-600 italic tracking-tighter">{priceText}</p>
      </div>
    </div>
  );
}

export default function SizeFilterGrid({ products, categoryName }: { products: any[]; categoryName?: string }) {
  const [size, setSize] = useState<string | null>(null);

  // Mevcut numaralar
  const sizes = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      for (const v of p.product_variants ?? []) {
        if (isSizeVariant(v)) { const s = sizeValue(v); if (s) set.add(s); }
      }
    }
    return [...set].sort((a, b) => parseFloat(a.replace(",", ".")) - parseFloat(b.replace(",", ".")));
  }, [products]);

  // Seçilen numaraya göre ayrım
  const { inStock, outStock } = useMemo(() => {
    if (!size) return { inStock: products, outStock: [] as any[] };
    const inS: any[] = [];
    const outS: any[] = [];
    for (const p of products) {
      const sizeVars = (p.product_variants ?? []).filter((v: any) => isSizeVariant(v) && sizeValue(v) === size);
      if (sizeVars.length === 0) continue; // bu numara yok → gizle
      const hasStock = sizeVars.some((v: any) => Number(v.stock ?? 0) > 0);
      (hasStock ? inS : outS).push(p);
    }
    return { inStock: inS, outStock: outS };
  }, [products, size]);

  const gridCls = "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-16";

  return (
    <div className="space-y-8">
      {/* Numara filtresi */}
      {sizes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-black uppercase tracking-widest text-slate-400 mr-1">Numara:</span>
          <button
            onClick={() => setSize(null)}
            className={`px-3 h-9 rounded-xl text-sm font-bold border-2 transition-all ${size === null ? "border-olive-600 bg-olive-600 text-white" : "border-slate-200 text-slate-600 hover:border-olive-300"}`}
          >
            Hepsi
          </button>
          {sizes.map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              className={`min-w-[44px] h-9 px-2 rounded-xl text-sm font-bold border-2 transition-all ${size === s ? "border-olive-600 bg-olive-600 text-white" : "border-slate-200 text-slate-700 hover:border-olive-300"}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Sonuç */}
      {!size ? (
        products.length === 0 ? (
          <div className="text-center py-20 text-slate-400">Bu kategoride henüz ürün bulunmuyor.</div>
        ) : (
          <div className={gridCls}>
            {products.map((p) => <ProductCard key={p.id} product={p} categoryName={categoryName} />)}
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
              <div className={gridCls}>{inStock.map((p) => <ProductCard key={p.id} product={p} categoryName={categoryName} />)}</div>
            )}
          </div>

          {/* Stokta olmayanlar */}
          {outStock.length > 0 && (
            <div className="pt-4 border-t border-dashed border-slate-200">
              <div className="flex items-center gap-2 mb-6">
                <PackageX size={16} className="text-slate-400" />
                <h2 className="text-lg font-black text-slate-400 uppercase italic">{size} Numara — Şu An Stokta Değil ({outStock.length})</h2>
              </div>
              <div className={`${gridCls} opacity-60`}>
                {outStock.map((p) => <ProductCard key={p.id} product={p} categoryName={categoryName} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
