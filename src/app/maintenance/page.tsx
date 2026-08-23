import type { Metadata } from "next";
import { Wrench } from "lucide-react";

export const metadata: Metadata = {
  title: "Bakım Çalışması",
  description: "Sitemiz kısa bir bakım çalışması için geçici olarak kapalı.",
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 text-center bg-background">
      <div className="flex items-center justify-center w-20 h-20 rounded-full bg-secondary animate-float">
        <Wrench className="text-primary" size={36} />
      </div>
      <h1 className="text-2xl sm:text-3xl font-black text-foreground">
        Kısa bir bakım çalışması yapıyoruz
      </h1>
      <p className="text-muted-foreground max-w-md">
        Sizlere daha iyi bir deneyim sunmak için sitemizi güncelliyoruz. Çok
        kısa süre içinde tekrar buradayız. Anlayışınız için teşekkür ederiz.
      </p>
      <p className="text-sm font-semibold text-primary">YeriHisset</p>
    </main>
  );
}
