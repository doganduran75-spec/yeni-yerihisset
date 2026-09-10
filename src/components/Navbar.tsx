"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ShoppingBag, Search, User, Menu, X, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/store/useCartStore";

interface NavbarProps {
  variant?: "default" | "minimal";
}

// Menü linkleri (masaüstü + mobil paylaşır). "Mağaza" eskiden ayrı olan
// "Yeni Gelenler" + "Kategoriler"i tek satırda birleştirir (ikisi de /products).
const NAV_LINKS = [
  { label: "Mağaza", href: "/products" },
  { label: "Fırsatlar", href: "/firsatlar" },
  { label: "Bilgi Bankası", href: "/bilgi-bankasi" },
];

export default function Navbar({ variant = "default" }: NavbarProps) {
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const { items } = useCartStore();

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = search.trim();
    if (q) { setMenuOpen(false); router.push(`/ara?q=${encodeURIComponent(q)}`); }
  }

  useEffect(() => {
    setMounted(true);
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (variant === "minimal") {
    return (
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          <Link href="/" className="text-2xl font-black tracking-tighter text-olive-600">
            Yeri<span className="text-slate-900">Hisset</span>
          </Link>
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <Shield size={16} className="text-green-500" />
                <span className="hidden sm:inline">Güvenli İşlem</span>
             </div>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header 
      className={cn(
        "sticky top-0 z-50 transition-all duration-300 border-b",
        scrolled ? "bg-white/80 backdrop-blur-md h-16" : "bg-white h-24"
      )}
    >
      <div className="container mx-auto px-4 h-full flex items-center justify-between">
        <div className="flex items-center gap-12">
          <Link href="/" className="text-3xl font-black tracking-tighter text-olive-600 transition-transform active:scale-95">
            Yeri<span className="text-slate-900">Hisset</span>
          </Link>
          
          <nav className="hidden lg:flex items-center gap-8">
            {NAV_LINKS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="text-sm font-black uppercase tracking-widest text-slate-500 hover:text-olive-600 transition-colors relative group py-2"
              >
                {item.label}
                <span className="absolute bottom-0 left-0 w-0 h-1 bg-olive-600 transition-all group-hover:w-full rounded-full" />
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-6">
          <form onSubmit={submitSearch} className="hidden md:flex items-center bg-slate-50 rounded-2xl px-4 py-2 border border-slate-100 focus-within:ring-2 focus-within:ring-olive-100 focus-within:bg-white transition-all">
            <button type="submit" aria-label="Ara" className="text-slate-400 hover:text-olive-600 transition-colors">
              <Search size={18} />
            </button>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ürün Ara..."
              className="bg-transparent border-none focus:ring-0 text-sm font-bold text-slate-800 placeholder:text-slate-400 w-48 ml-2 outline-none"
            />
          </form>

          <div className="flex items-center gap-1">
            <Link 
              href="/account"
              className="p-3 hover:bg-slate-50 rounded-2xl transition-all text-slate-700 hover:text-olive-600 group"
              title="Hesabım"
            >
              <User size={22} className="group-active:scale-90 transition-transform" />
            </Link>
            
            <Link 
              href="/sepet"
              className="p-3 hover:bg-slate-50 rounded-2xl transition-all text-slate-700 hover:text-olive-600 relative group"
              title="Sepetim"
            >
              <ShoppingBag size={22} className="group-active:scale-90 transition-transform" />
              {mounted && items.length > 0 && (
                <span className="absolute top-1 right-1 min-w-5 h-5 bg-olive-600 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white px-1 font-black animate-in zoom-in shadow-lg shadow-olive-100">
                  {items.reduce((total, item) => total + item.quantity, 0)}
                </span>
              )}
            </Link>

            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? "Menüyü kapat" : "Menüyü aç"}
              aria-expanded={menuOpen}
              className="lg:hidden p-3 hover:bg-slate-50 rounded-2xl transition-all text-slate-700"
            >
              {menuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobil menü paneli */}
        {menuOpen && (
          <div className="lg:hidden absolute left-0 right-0 top-full bg-white border-b shadow-xl animate-in slide-in-from-top-2 duration-200">
            <div className="container mx-auto px-4 py-4 space-y-4">
              {/* Arama (mobilde header'da yok, buraya koyduk) */}
              <form onSubmit={submitSearch} className="flex items-center bg-slate-50 rounded-2xl px-4 py-3 border border-slate-100 focus-within:ring-2 focus-within:ring-olive-100 focus-within:bg-white transition-all">
                <button type="submit" aria-label="Ara" className="text-slate-400 hover:text-olive-600 transition-colors">
                  <Search size={18} />
                </button>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Ürün Ara..."
                  className="bg-transparent border-none focus:ring-0 text-sm font-bold text-slate-800 placeholder:text-slate-400 flex-1 ml-2 outline-none"
                />
              </form>

              <nav className="flex flex-col">
                {NAV_LINKS.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="py-3 text-sm font-black uppercase tracking-widest text-slate-700 hover:text-olive-600 border-b border-slate-50 transition-colors"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
