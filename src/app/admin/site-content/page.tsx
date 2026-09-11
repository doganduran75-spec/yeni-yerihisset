"use client";

import { Suspense } from "react";
import { BookOpen } from "lucide-react";
import KBArticlesManager from "@/components/admin/KBArticlesManager";

// NOT: Eski "Sayfa İçerikleri" (site_content) editörü kaldırıldı — yeni ana sayfa
// (MobileHome/DesktopHome) içeriği artık src/config/homeContent.ts'ten okunuyor,
// site_content'i hiçbir sayfa okumuyordu. Bu ekran yalnız Bilgi Bankası'nı yönetir.
function SiteContentAndKB() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <BookOpen size={26} /> Bilgi Bankası
        </h2>
        <p className="text-muted-foreground">Bilgi Bankası yazılarını yönetin.</p>
      </div>
      <KBArticlesManager />
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
