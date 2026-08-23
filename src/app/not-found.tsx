import Link from "next/link";
import { Home, Search } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 text-center bg-background">
      <p className="font-heading text-7xl sm:text-8xl font-black text-primary/20 select-none">404</p>
      <h1 className="text-2xl sm:text-3xl font-black text-foreground -mt-4">
        Sayfa bulunamadı
      </h1>
      <p className="text-muted-foreground max-w-md">
        Aradığınız sayfa taşınmış, silinmiş ya da hiç var olmamış olabilir.
        Aşağıdan ana sayfaya dönebilirsiniz.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm btn-juice hover:opacity-90 transition-opacity"
        >
          <Home size={18} /> Ana Sayfa
        </Link>
        <Link
          href="/firsatlar"
          className="inline-flex items-center gap-2 px-6 py-3 bg-secondary text-secondary-foreground rounded-xl font-bold text-sm btn-juice hover:opacity-90 transition-opacity"
        >
          <Search size={18} /> Fırsatları Keşfet
        </Link>
      </div>
    </main>
  );
}
