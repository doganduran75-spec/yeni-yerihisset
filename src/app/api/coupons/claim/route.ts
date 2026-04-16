import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const userClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  const { code } = await req.json();
  if (!code?.trim()) return NextResponse.json({ error: "Kupon kodu gerekli" }, { status: 400 });

  const supabase = createAdminClient();

  // Kuponu bul
  const { data: coupon } = await supabase
    .from("coupons")
    .select("*")
    .eq("code", code.trim().toUpperCase())
    .eq("is_active", true)
    .single();

  if (!coupon) return NextResponse.json({ error: "Geçersiz veya pasif kupon kodu" }, { status: 404 });

  // Süre kontrolü
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return NextResponse.json({ error: "Bu kupon süresi dolmuş" }, { status: 400 });
  }

  // Zaten sahip mi?
  const { data: existing } = await supabase
    .from("user_coupons")
    .select("id")
    .eq("user_id", user.id)
    .eq("coupon_id", coupon.id)
    .maybeSingle();

  if (existing) return NextResponse.json({ error: "Bu kupon zaten hesabınızda kayıtlı" }, { status: 409 });

  // Kişiye özel kuponu herkes ekleyemez (sadece admin atayabilir)
  if (coupon.is_personal) {
    return NextResponse.json({ error: "Bu kupon size özel değil. Kodu doğrulayın." }, { status: 403 });
  }

  // Kullanım limiti dolmuş mu?
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    return NextResponse.json({ error: "Bu kupon kullanım limitine ulaşmış" }, { status: 400 });
  }

  // User coupon ekle
  const { error } = await supabase
    .from("user_coupons")
    .insert({ user_id: user.id, coupon_id: coupon.id });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      name: coupon.name,
      type: coupon.type,
      amount: coupon.amount,
      expires_at: coupon.expires_at,
    },
  });
}
