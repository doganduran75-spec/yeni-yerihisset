"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Handshake, Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import PartnersManager from "@/components/admin/PartnersManager";
import OpportunitiesManager from "@/components/admin/OpportunitiesManager";

type Tab = "partners" | "firsatlar";

function PartnersAndOpportunities() {
  const params = useSearchParams();
  const initial: Tab = params.get("tab") === "firsatlar" ? "firsatlar" : "partners";
  const [tab, setTab] = useState<Tab>(initial);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">İş Ortakları &amp; Fırsatları</h2>
        <p className="text-muted-foreground">İş ortaklarını ve onların sunduğu fırsatları tek yerden yönetin.</p>
      </div>

      {/* Sekmeler */}
      <div className="flex gap-1 border-b border-slate-200">
        {([
          { key: "partners" as Tab, label: "İş Ortakları", icon: Handshake },
          { key: "firsatlar" as Tab, label: "İş Ortağı Fırsatları", icon: Gift },
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
      {tab === "partners" ? <PartnersManager /> : <OpportunitiesManager />}
    </div>
  );
}

export default function PartnersPage() {
  return (
    <Suspense fallback={null}>
      <PartnersAndOpportunities />
    </Suspense>
  );
}
