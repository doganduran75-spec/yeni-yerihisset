"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Store, Search, Gift, User, X } from "lucide-react";
import SegmentChooser from "@/components/SegmentChooser";

// Mobil alt sekme çubuğu (app hissi). Yalnız mobilde; masaüstünde gizli.
// DESIGN.md yeşili (#588E28) + Plus Jakarta Sans etiketler.
const TABS = [
  { href: "/", label: "Ana Sayfa", icon: Home, match: (p: string) => p === "/" },
  { href: "/magaza", label: "Mağaza", icon: Store, match: (p: string) => p.startsWith("/magaza") || p.startsWith("/products") || p.startsWith("/kategori") || p.startsWith("/marka") },
  { href: "/ara", label: "Arama", icon: Search, match: (p: string) => p.startsWith("/ara") },
  { href: "/firsatlar", label: "Fırsatlar", icon: Gift, match: (p: string) => p.startsWith("/firsatlar") },
  { href: "/account", label: "Profil", icon: User, match: (p: string) => p.startsWith("/account") },
];

export default function MobileTabBar() {
  const pathname = usePathname() || "/";
  // Mağaza: hangi mağaza? Alttan açılan panel (Yetişkin / 0–4 Yaş İlkadım) — kullanıcı kararı 2026-10-18
  const [shopOpen, setShopOpen] = useState(false);
  useEffect(() => { setShopOpen(false); }, [pathname]); // eslint-disable-line react-hooks/set-state-in-effect

  // Admin panelinde site alt menüsü gösterilmez (admin kendi menüsünü kullanır).
  if (pathname.startsWith("/admin")) return null;
  // Ödeme sırasında gizli: dikkat dağıtmasın, "Siparişi tamamla"ya yakın yanlış dokunma olmasın
  if (pathname.startsWith("/checkout")) return null;

  return (
    <>
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur border-t border-[#E8E4DC]"
      style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif", paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Alt menü"
    >
      <ul className="grid grid-cols-5">
        {TABS.map((t) => {
          const active = t.match(pathname);
          const Icon = t.icon;
          const inner = (
            <>
              <Icon size={22} strokeWidth={active ? 2.4 : 1.9} />
              <span className="text-[10.5px] font-semibold tracking-wide" style={{ fontWeight: active ? 700 : 500 }}>{t.label}</span>
            </>
          );
          const cls = "flex flex-col items-center justify-center gap-1 h-16 w-full transition-colors";
          return (
            <li key={t.href}>
              {t.href === "/magaza" ? (
                <button type="button" onClick={() => setShopOpen(true)} className={cls} style={{ color: active || shopOpen ? "#3F6D14" : "#8A897F" }} aria-haspopup="dialog">
                  {inner}
                </button>
              ) : (
                <Link href={t.href} className={cls} style={{ color: active ? "#3F6D14" : "#8A897F" }}>{inner}</Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
    {/* Panel alt çubuğun DIŞINDA: backdrop-blur'lu kapsayıcı fixed konumu kendine bağlar */}
    {shopOpen && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Mağaza seçimi">
          <button type="button" aria-label="Kapat" className="absolute inset-0 bg-black/40" onClick={() => setShopOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-[#FCFAF6] px-5 pt-4 shadow-2xl animate-in slide-in-from-bottom duration-200"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}>
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300" />
            <div className="flex items-center justify-between mb-3">
              <p className="text-lg font-black text-slate-900">Hangi mağaza?</p>
              <button type="button" aria-label="Kapat" onClick={() => setShopOpen(false)} className="text-slate-400"><X size={22} /></button>
            </div>
            <SegmentChooser compact source="alt_menu" onPick={() => setShopOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
