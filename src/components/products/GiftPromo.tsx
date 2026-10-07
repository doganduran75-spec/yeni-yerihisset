"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// ÜRÜN SAYFASI HEDİYE TANITIMI: bu ürünün kategorisi bir hediye kuralını tetikliyorsa
// (Admin › Bedelsiz Ürünler) sepete eklemeden ÖNCE görünür: "Bu ürünle birlikte … HEDİYE".
// Hediye sepete eklenince otomatik gelir (seçim gerekiyorsa sepette seçilir).
import { useEffect, useState } from "react";
import Image from "next/image";
import { Gift } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Promo = { id: string; title: string; image: string | null; price: number; needsChoice: boolean; group: string | null };

export default function GiftPromo({ categoryId }: { categoryId: string | null | undefined }) {
  const [promos, setPromos] = useState<Promo[]>([]);

  useEffect(() => {
    if (!categoryId) return;
    let alive = true;
    (async () => {
      const { data } = await (supabase as any)
        .from("free_gift_rules")
        .select("id, selection_group, gift_product:products!gift_product_id(id, title, image_url, images, price, has_variants, stock, product_variants(id, stock))")
        .eq("trigger_category_id", categoryId)
        .eq("is_active", true);
      if (!alive) return;
      const list: Promo[] = [];
      for (const r of (data as any[]) ?? []) {
        const g = r.gift_product;
        if (!g) continue;
        const inStock = g.has_variants
          ? (g.product_variants ?? []).filter((v: any) => Number(v.stock ?? 0) > 0)
          : Number(g.stock ?? 0) > 0 ? [1] : [];
        if (!inStock.length) continue; // hediye stokta yoksa vaat etme
        list.push({
          id: r.id, title: g.title, image: g.images?.[0] ?? g.image_url ?? null, price: Number(g.price ?? 0),
          needsChoice: g.has_variants && inStock.length > 1, group: r.selection_group ?? null,
        });
      }
      setPromos(list);
    })();
    return () => { alive = false; };
  }, [categoryId]);

  if (!promos.length) return null;
  const choose = promos.length > 1 && promos.every((p) => p.group && p.group === promos[0].group);

  return (
    <div className="rounded-2xl border-2 border-olive-300 bg-gradient-to-br from-olive-50 to-white p-4 space-y-3">
      <p className="text-xs font-black text-olive-700 uppercase tracking-widest flex items-center gap-1.5">
        <Gift size={15} /> {choose ? "Bu ürünle birlikte hediyeni seç" : "Bu ürünle birlikte hediye"}
      </p>
      <div className="space-y-2.5">
        {promos.map((p, i) => (
          <div key={p.id} className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl overflow-hidden bg-white border border-olive-100 shrink-0 flex items-center justify-center">
              {p.image ? <Image src={p.image} alt={p.title} width={128} height={128} className="w-full h-full object-cover" /> : <Gift className="text-olive-300" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-900 text-sm leading-snug line-clamp-2">{choose && i > 0 ? "veya " : ""}{p.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {p.price > 0 && <span className="text-xs text-slate-400 line-through">₺{p.price.toLocaleString("tr-TR")}</span>}
                <span className="text-[11px] font-black text-white bg-olive-600 rounded-md px-2 py-0.5">ÜCRETSİZ</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        {choose || promos.some((p) => p.needsChoice)
          ? "Ürünü sepete ekleyince hediyeni sepette seçebilirsin."
          : "Ürünü sepete eklediğinde hediyen otomatik olarak eklenir."}
      </p>
    </div>
  );
}
