"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileEdit, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import SiteContentManager from "@/components/admin/SiteContentManager";
import KBArticlesManager from "@/components/admin/KBArticlesManager";

type Tab = "content" | "kb";

function SiteContentAndKB() {
  const params = useSearchParams();
  const initial: Tab = params.get("tab") === "kb" ? "kb" : "content";
  const [tab, setTab] = useState<Tab>(initial);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Sayfa İçerikleri &amp; Bilgi Bankası</h2>
        <p className="text-muted-foreground">Site metinlerini/görsellerini ve Bilgi Bankası yazılarını tek yerden yönetin.</p>
      </div>

      {/* Sekmeler */}
      <div className="flex gap-1 border-b border-slate-200">
        {([
          { key: "content" as Tab, label: "Sayfa İçerikleri", icon: FileEdit },
          { key: "kb" as Tab, label: "Bilgi Bankası", icon: BookOpen },
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
      {tab === "content" ? <SiteContentManager /> : <KBArticlesManager />}
    </div>
  );
}

export default function SiteContentPage() {
  return (
    <Suspense fallback={null}>
      <SiteContentAndKB />
    </Suspense>
  );
}
