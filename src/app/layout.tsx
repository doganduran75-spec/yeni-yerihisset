import type { Metadata } from "next";
import { Outfit, Inter, Epilogue, Plus_Jakarta_Sans } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import PopupBanner from "@/components/PopupBanner";
import ScrollToTop from "@/components/ScrollToTop";
import VisitTracker from "@/components/VisitTracker";
import GlobalStructuredData from "@/components/GlobalStructuredData";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import MarketingSetup from "@/components/MarketingSetup";
import MobileTabBar from "@/components/MobileTabBar";
import CookieBanner from "@/components/CookieBanner";
import FormValidationMessages from "@/components/FormValidationMessages";
import AffiliateRefCapture from "@/components/AffiliateRefCapture";
import { SiteDialogHost } from "@/components/ui/site-dialog";
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
    default: "YeriHisset | Barefoot Ayakkabı — Yetişkin ve Çocuk",
    template: "%s | YeriHisset",
  },
  description:
    "Barefoot ayakkabı: geniş burun, sıfır topuk farkı, esnek ince taban. Yetişkinler için Dodura, ilk adımlar için Attipas. 14 gün evde dene, ücretsiz iade.",
  keywords: ["barefoot ayakkabı", "çıplak ayak ayakkabı", "minimalist ayakkabı", "ilk adım ayakkabısı", "Attipas", "Dodura", "YeriHisset"],
  authors: [{ name: "YeriHisset" }],
  creator: "YeriHisset",
  publisher: "YeriHisset",
  openGraph: {
    type: "website",
    locale: "tr_TR",
    url: SITE_URL,
    siteName: "YeriHisset",
    title: "YeriHisset | Barefoot Ayakkabı — Yetişkin ve Çocuk",
    description:
      "Barefoot ayakkabı: geniş burun, sıfır topuk farkı, esnek ince taban. 14 gün evde dene, ücretsiz iade.",
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
    title: "YeriHisset | Barefoot Ayakkabı — Yetişkin ve Çocuk",
    description:
      "Barefoot ayakkabı: geniş burun, sıfır topuk farkı, esnek ince taban. 14 gün evde dene, ücretsiz iade.",
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
  // canonical burada YOK: kök düzende tanımlanınca kendi canonical'ı olmayan her alt sayfaya miras kalıp
  // "asıl sayfam ana sayfa" diyordu (ör. /barefoot-nedir dizinden düşerdi). Her sayfa kendi canonical'ını verir.
  // Google Search Console doğrulaması — token'ı env'e koy (NEXT_PUBLIC_GSC_VERIFICATION).
  // Yoksa hiçbir şey render edilmez.
  ...(process.env.NEXT_PUBLIC_GSC_VERIFICATION
    ? { verification: { google: process.env.NEXT_PUBLIC_GSC_VERIFICATION } }
    : {}),
  // Staging'i arama motorlarından gizle: sunucuda NEXT_PUBLIC_NOINDEX=true iken
  // tüm site noindex olur. Canlıda bu env KALDIRILIR → normal indekslenir.
  ...(process.env.NEXT_PUBLIC_NOINDEX === "true"
    ? { robots: { index: false, follow: false } }
    : {}),
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
        <MarketingSetup />
      </head>
      <body className="font-sans bg-background text-foreground selection:bg-olive-100 selection:text-olive-800 pb-16 md:pb-0" suppressHydrationWarning>
        <TooltipProvider>
          <FormValidationMessages />
          <AffiliateRefCapture />
          {children}
          <PopupBanner />
          <ScrollToTop />
          <VisitTracker />
          <MobileTabBar />
          <CookieBanner />
          <SiteDialogHost />
        </TooltipProvider>
      </body>
    </html>
  );
}
