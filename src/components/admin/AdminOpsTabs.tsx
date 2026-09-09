"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { CreditCard, ShoppingBag, Star, Boxes } from "lucide-react";

/**
 * "Stok Yönetimi" birleşik menüsünün sekme çubuğu. 4 işletme sayfası (Siparişler,
 * Ürünler, Yorumlar, Stok Yönetimi) kendi route'unda kalır (derin linkler
 * korunur); bu çubuk üstlerinde durup aralarında geçiş sağlar. Sidebar'da tek
 * menü görünür.
 */
const TABS = [
  { key: "orders", label: "Siparişler", href: "/admin/orders", icon: CreditCard },
  { key: "products", label: "Ürünler", href: "/admin/products", icon: ShoppingBag },
  { key: "reviews", label: "Yorumlar", href: "/admin/reviews", icon: Star },
  { key: "stock", label: "Stok Yönetimi", href: "/admin/stock", icon: Boxes },
] as const;

export type OpsTab = (typeof TABS)[number]["key"];

export default function AdminOpsTabs({ active }: { active: OpsTab }) {
  return (
    <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
      {TABS.map((t) => {
        const Icon = t.icon;
        return (
          <Link
            key={t.key}
            href={t.href}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px whitespace-nowrap transition-colors",
              active === t.key
                ? "border-olive-600 text-olive-700"
                : "border-transparent text-slate-400 hover:text-slate-600"
            )}
          >
            <Icon size={16} /> {t.label}
          </Link>
        );
      })}
    </div>
  );
}
