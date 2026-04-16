import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ödeme | YeriHisset",
  robots: { index: false, follow: false },
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
