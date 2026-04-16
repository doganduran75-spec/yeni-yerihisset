import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(_req: NextRequest) {
  const cookieStore = await cookies();

  const userClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );

  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: affiliate } = await supabase
    .from("affiliate_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!affiliate) {
    return NextResponse.json({ affiliate: null });
  }

  // Tıklama sayısı
  const { count: clickCount } = await supabase
    .from("affiliate_clicks")
    .select("*", { count: "exact", head: true })
    .eq("affiliate_id", affiliate.id);

  // Dönüşümler
  const { data: conversions } = await supabase
    .from("affiliate_conversions")
    .select("*")
    .eq("affiliate_id", affiliate.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const totalEarnings = (conversions ?? [])
    .filter((c) => c.status !== "cancelled")
    .reduce((sum, c) => sum + Number(c.commission_amount), 0);

  const pendingEarnings = (conversions ?? [])
    .filter((c) => c.status === "pending")
    .reduce((sum, c) => sum + Number(c.commission_amount), 0);

  return NextResponse.json({
    affiliate: {
      ...affiliate,
      total_clicks: clickCount ?? 0,
      total_earnings: totalEarnings,
    },
    conversions: conversions ?? [],
    pendingEarnings,
  });
}
