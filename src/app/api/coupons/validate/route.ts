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

  const { code, cartTotal } = await req.json();
  if (!code) return NextResponse.json({ error: "Kupon kodu gerekli" }, { status: 400 });

  const supabase = createAdminClient();

  // Kuponu bul
  const { data: coupon } = await supabase
    .from("coupons")
    .select("*")
    .eq("code", code.trim().toUpperCase())
    .eq("is_active", true)
    .single();

  if (!coupon) return NextResponse.json({ error: "Geçersiz veya pasif kupon kodu" }, { status: 404 });

  // Geçerlilik tarihi kontrolü
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return NextResponse.json({ error: "Bu kupon süresi dolmuş" }, { status: 400 });
  }
  if (coupon.starts_at && new Date(coupon.starts_at) > new Date()) {
    return NextResponse.json({ error: "Bu kupon henüz aktif değil" }, { status: 400 });
  }

  // Toplam kullanım limiti
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    return NextResponse.json({ error: "Bu kupon kullanım limitine ulaşmış" }, { status: 400 });
  }

  // Minimum sipariş tutarı
  if (cartTotal < coupon.min_order_amount) {
    return NextResponse.json({
      error: `Bu kupon için minimum sipariş tutarı ₺${coupon.min_order_amount.toLocaleString("tr-TR")}`,
    }, { status: 400 });
  }

  // Kişiye özel kupon: bu kullanıcıya atanmış mı?
  if (coupon.is_personal) {
    const { data: uc } = await supabase
      .from("user_coupons")
      .select("id, use_count")
      .eq("user_id", user.id)
      .eq("coupon_id", coupon.id)
      .maybeSingle();
    if (!uc) return NextResponse.json({ error: "Bu kupon size özel değil veya atanmamış" }, { status: 403 });
    if (uc.use_count >= coupon.per_user_limit) {
      return NextResponse.json({ error: "Bu kuponu zaten kullandınız" }, { status: 400 });
    }
  } else {
    // Evrensel kupon: kullanıcı daha önce kullanmış mı?
    const { data: uc } = await supabase
      .from("user_coupons")
      .select("id, use_count")
      .eq("user_id", user.id)
      .eq("coupon_id", coupon.id)
      .maybeSingle();
    if (uc && uc.use_count >= coupon.per_user_limit) {
      return NextResponse.json({ error: "Bu kuponu daha önce kullandınız" }, { status: 400 });
    }
  }

  // İndirim tutarını hesapla
  let discountAmount = 0;
  let freeShipping = false;

  if (coupon.type === "percentage") {
    discountAmount = (cartTotal * coupon.amount) / 100;
    if (coupon.max_discount_amount !== null) {
      discountAmount = Math.min(discountAmount, coupon.max_discount_amount);
    }
  } else if (coupon.type === "fixed") {
    discountAmount = Math.min(coupon.amount, cartTotal);
  } else if (coupon.type === "free_shipping") {
    freeShipping = true;
    discountAmount = 0;
  }

  discountAmount = Math.round(discountAmount * 100) / 100;

  return NextResponse.json({
    valid: true,
    coupon_id: coupon.id,
    name: coupon.name,
    type: coupon.type,
    amount: coupon.amount,
    discount_amount: discountAmount,
    free_shipping: freeShipping,
  });
}
