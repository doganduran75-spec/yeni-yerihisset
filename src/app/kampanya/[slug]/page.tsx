import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CampaignClient from "./CampaignClient";

// Kampanya landing'leri arama motorlarına açılmaz (özel/kısa link).
export const metadata: Metadata = { robots: { index: false, follow: false } };
export const revalidate = 60;

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

export default async function KampanyaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sb = getSupabase();
  // Yalnız aktif kupon (RLS "Public read active coupons"). Süre/limit son kontrolü
  // sepette /api/coupons/validate yapar — burada sadece tanıtım + kodu tanımlama.
  const { data: coupon } = await sb
    .from("coupons")
    .select("code, name, description, type, amount, min_order_amount, expires_at")
    .eq("campaign_slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  return (
    <>
      <Navbar />
      <CampaignClient slug={slug} coupon={coupon as any} />
      <Footer />
    </>
  );
}
