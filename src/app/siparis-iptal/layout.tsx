import type { Metadata } from "next";

// Kişiye özel iptal sayfası — arama motoruna kapalı
export const metadata: Metadata = { title: "Siparişi iptal et", robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
