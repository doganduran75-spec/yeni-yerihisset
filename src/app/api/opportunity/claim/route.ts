import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * #2 Fırsat "Yararlan" — kupon fırsatını kullanıcının hesabına ekler.
 * Her yararlanma kişiye 1 kullanım hakkı ekler (user_coupons.max_uses),
 * claim_limit'e kadar. Kupon Hesabım→Kuponlarım'a düşer, sepette kullanılır.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Giriş yapmalısınız", needAuth: true }, { status: 401 });

  const { opportunityId } = (await req.json().catch(() => ({}))) as { opportunityId?: string };
  if (!opportunityId) return NextResponse.json({ error: "opportunityId gerekli" }, { status: 400 });

  const supabase = createAdminClient();

  const { data: opp } = await supabase
    .from("partner_opportunities")
    .select("id, kind, coupon_id, claim_limit, is_active")
    .eq("id", opportunityId)
    .maybeSingle();

  if (!opp || !(opp as any).is_active) return NextResponse.json({ error: "Fırsat bulunamadı" }, { status: 404 });
  if ((opp as any).kind !== "coupon" || !(opp as any).coupon_id) {
    return NextResponse.json({ error: "Bu fırsat kupon fırsatı değil" }, { status: 400 });
  }

  const couponId = (opp as any).coupon_id as string;
  const claimLimit = Number((opp as any).claim_limit ?? 1);

  // Mevcut hak (granted = max_uses). Yoksa 0.
  const { data: uc } = await supabase
    .from("user_coupons")
    .select("id, use_count, max_uses")
    .eq("user_id", user.id)
    .eq("coupon_id", couponId)
    .maybeSingle();

  const granted = (uc as any)?.max_uses ?? 0;
  if (granted >= claimLimit) {
    return NextResponse.json({ ok: true, alreadyMax: true, granted, limit: claimLimit });
  }

  const newGranted = granted + 1;
  if (uc) {
    const { error } = await supabase
      .from("user_coupons")
      .update({ max_uses: newGranted })
      .eq("id", (uc as any).id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase
      .from("user_coupons")
      .insert({ user_id: user.id, coupon_id: couponId, use_count: 0, max_uses: 1 } as any);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    granted: newGranted,
    limit: claimLimit,
    remaining: claimLimit - newGranted,
  });
}
