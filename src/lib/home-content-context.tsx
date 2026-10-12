"use client";

import { createContext, useContext } from "react";
import { homeContent, type HomeContent } from "@/config/homeContent";

// Ana sayfa metinleri: varsayılan src/config/homeContent.ts; panelde (Ayarlar › Ana Sayfa) değiştirilenler sunucuda
// üstüne yazılıp (src/lib/home-content.ts) HomeClient → bu bağlamla MobileHome / DesktopHome'a gelir.
const Ctx = createContext<HomeContent>(homeContent);

export function HomeContentProvider({ value, children }: { value?: HomeContent | null; children: React.ReactNode }) {
  return <Ctx.Provider value={value ?? homeContent}>{children}</Ctx.Provider>;
}

export const useHomeContent = () => useContext(Ctx);
