"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Ticket, Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import CouponsManager from "@/components/admin/CouponsManager";
import FreeGiftsManager from "@/components/admin/FreeGiftsManager";

type Tab = "coupons" | "gifts";

function CouponsAndGifts() {
  const params = useSearchParams();
  const initial: Tab = params.get("tab") === "gifts" ? "gifts" : "coupons";
  const [tab, setTab] = useState<Tab>(initial);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Kuponlar &amp; Ücretsiz Ürünler</h2>
        <p className="text-muted-foreground">İndirim kuponlarını ve otomatik ücretsiz ürün kurallarını tek yerden yönetin.</p>
      </div>

      {/* Sekmeler */}
      <div className="flex gap-1 border-b border-slate-200">
        {([
          { key: "coupons" as Tab, label: "Kuponlar", icon: Ticket },
          { key: "gifts" as Tab, label: "Ücretsiz Ürünler", icon: Gift },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors",
              tab === key
                ? "border-olive-600 text-olive-700"
                : "border-transparent text-slate-400 hover:text-slate-600"
            )}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* İçerik */}
      {tab === "coupons" ? <CouponsManager /> : <FreeGiftsManager />}
    </div>
  );
}

export default function CouponsPage() {
  return (
    <Suspense fallback={null}>
      <CouponsAndGifts />
    </Suspense>
  );
}
