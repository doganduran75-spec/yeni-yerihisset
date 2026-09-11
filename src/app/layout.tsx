import type { Metadata } from "next";
import { Outfit, Inter, Epilogue, Plus_Jakarta_Sans } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import PopupBanner from "@/components/PopupBanner";
import ScrollToTop from "@/components/ScrollToTop";
import VisitTracker from "@/components/VisitTracker";
import GlobalStructuredData from "@/components/GlobalStructuredData";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import MobileTabBar from "@/components/MobileTabBar";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// DESIGN.md — yeni mobil ana sayfa bölümleri için (şimdilik yalnız orada kullanılır)
const epilogue = Epilogue({
  variable: "--font-epilogue",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://yerihisset.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "YeriHisset | Kaliteli Alışveriş ve Bilgi Platformu",
    template: "%s | YeriHisset",
  },
  description:
    "En yeni ürünler, harika fırsatlar ve zengin içerikler tek bir platformda. Kaliteli alışverişin adresi YeriHisset.",
  keywords: ["alışveriş", "ürünler", "indirim", "kampanya", "YeriHisset"],
  authors: [{ name: "YeriHisset" }],
  creator: "YeriHisset",
  publisher: "YeriHisset",
  openGraph: {
    type: "website",
    locale: "tr_TR",
    url: SITE_URL,
    siteName: "YeriHisset",
    title: "YeriHisset | Kaliteli Alışveriş ve Bilgi Platformu",
    description:
      "En yeni ürünler, harika fırsatlar ve zengin içerikler tek bir platformda.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "YeriHisset",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "YeriHisset | Kaliteli Alışveriş ve Bilgi Platformu",
    description:
      "En yeni ürünler, harika fırsatlar ve zengin içerikler tek bir platformda.",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: SITE_URL,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className={`${outfit.variable} ${inter.variable} ${epilogue.variable} ${jakarta.variable} antialiased`} data-scroll-behavior="smooth">
      <head>
        <GlobalStructuredData />
        <GoogleAnalytics />
      </head>
      <body className="font-sans bg-background text-foreground selection:bg-olive-100 selection:text-olive-800 pb-16 md:pb-0" suppressHydrationWarning>
        <TooltipProvider>
          {children}
          <PopupBanner />
          <ScrollToTop />
          <VisitTracker />
          <MobileTabBar />
        </TooltipProvider>
      </body>
    </html>
  );
}
