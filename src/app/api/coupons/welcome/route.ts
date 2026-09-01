import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendCouponAssignedNotification } from "@/lib/notifications";

/**
 * Yeni üye kaydolduğunda çağrılır (kayıt akışından, fire-and-forget).
 * auto_assign_on_signup=true kuponları hesabına ekler + bilgilendirme e-postası gönderir.
 * Oturum gerektirmez; kötüye kullanımı sınırlamak için yalnızca SON 10 DAKİKADA
 * oluşturulmuş kullanıcılar için çalışır ve zaten atanmış kuponu tekrar atmaz/eposta göndermez.
 */
export async function POST(req: NextRequest) {
  const { userId } = (await req.json()) as { userId?: string };
  if (!userId) return NextResponse.json({ error: "userId zorunlu" }, { status: 400 });

  const supabase = createAdminClient();

  // Yeni kayıt mı? (kötüye kullanım koruması)
  const { data: authData } = await supabase.auth.admin.getUserById(userId);
  const u = authData?.user;
  if (!u) return NextResponse.json({ skipped: true, reason: "kullanıcı yok" });
  if (Date.now() - new Date(u.created_at).getTime() > 10 * 60 * 1000) {
    return NextResponse.json({ skipped: true, reason: "yeni kayıt değil" });
  }

  const { data: coupons } = await (supabase as any)
    .from("coupons")
    .select("id")
    .eq("auto_assign_on_signup", true)
    .eq("is_active", true);

  if (!coupons?.length) return NextResponse.json({ ok: true, atanan: 0 });

  const { data: existing } = await (supabase as any)
    .from("user_coupons")
    .select("coupon_id")
    .eq("user_id", userId);
  const have = new Set(((existing as any[]) || []).map((e) => e.coupon_id));

  let assigned = 0;
  let emailed = 0;
  for (const c of coupons as { id: string }[]) {
    if (have.has(c.id)) continue;
    const { error } = await (supabase as any)
      .from("user_coupons")
      .insert({ user_id: userId, coupon_id: c.id });
    if (error) continue;
    assigned++;
    const r = await sendCouponAssignedNotification(userId, c.id);
    if (r.status === "sent") emailed++;
  }

  return NextResponse.json({ ok: true, atanan: assigned, epostaGonderilen: emailed });
}
