import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { evaluateCoupon } from "@/lib/coupon-rules";

export async function POST(req: NextRequest) {
  // Oturum localStorage'da tutulduğundan Bearer token ile doğrulanır
  // (uygulamanın diğer uçlarıyla tutarlı).
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  const { code, cartTotal } = await req.json();
  if (!code) return NextResponse.json({ error: "Kupon kodu gerekli" }, { status: 400 });

  const supabase = createAdminClient();
  // Kupon kuralları tek yerde (src/lib/coupon-rules.ts) — siparişte de aynısı uygulanır
  const cr = await evaluateCoupon(supabase, { code, userId: user.id, productTotal: Number(cartTotal) || 0 });
  if (!cr.ok) return NextResponse.json({ error: cr.error }, { status: cr.status });
  const coupon = cr.coupon;
  const discountAmount = cr.discount;
  const freeShipping = cr.freeShipping;

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
