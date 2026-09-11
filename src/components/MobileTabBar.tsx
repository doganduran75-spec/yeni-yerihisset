"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sprout, Footprints, Search, Heart, User } from "lucide-react";

// Mobil alt sekme çubuğu (app hissi). Yalnız mobilde; masaüstünde gizli.
// DESIGN.md yeşili (#588E28) + Plus Jakarta Sans etiketler.
const TABS = [
  { href: "/", label: "Keşfet", icon: Sprout, match: (p: string) => p === "/" },
  { href: "/products", label: "Ayakkabılar", icon: Footprints, match: (p: string) => p.startsWith("/products") || p.startsWith("/kategori") || p.startsWith("/marka") },
  { href: "/ara", label: "Arama", icon: Search, match: (p: string) => p.startsWith("/ara") },
  { href: "/favoriler", label: "Favoriler", icon: Heart, match: (p: string) => p.startsWith("/favoriler") },
  { href: "/account", label: "Profil", icon: User, match: (p: string) => p.startsWith("/account") },
];

export default function MobileTabBar() {
  const pathname = usePathname() || "/";

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur border-t border-[#E8E4DC]"
      style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif", paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Alt menü"
    >
      <ul className="grid grid-cols-5">
        {TABS.map((t) => {
          const active = t.match(pathname);
          const Icon = t.icon;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className="flex flex-col items-center justify-center gap-1 h-16 transition-colors"
                style={{ color: active ? "#3F6D14" : "#8A897F" }}
              >
                <Icon size={22} strokeWidth={active ? 2.4 : 1.9} fill={t.icon === Heart && active ? "currentColor" : "none"} />
                <span className="text-[10.5px] font-semibold tracking-wide" style={{ fontWeight: active ? 700 : 500 }}>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
