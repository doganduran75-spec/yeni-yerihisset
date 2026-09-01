import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { sendCouponAssignedNotification } from "@/lib/notifications";

/**
 * Toplu kupon atama (admin).
 * Alıcılar: userIds[] veya tagOptionId (o etikete sahip üyeler) veya emails[].
 * Her üyeye user_coupons kaydı açar (varsa atlar) ve bilgilendirme e-postası gönderir.
 */
export async function POST(req: NextRequest) {
  const authUser = await getAuthUserFromRequest(req);
  if (!authUser) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const supabase = createAdminClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", authUser.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const body = (await req.json()) as {
    couponId?: string;
    userIds?: string[];
    tagOptionId?: string;
    emails?: string[];
    notify?: boolean;
  };
  const { couponId, tagOptionId, notify = true } = body;
  if (!couponId) return NextResponse.json({ error: "couponId zorunlu" }, { status: 400 });

  // ── Hedef kullanıcı ID'lerini topla ──────────────────────────────────────
  const targetIds = new Set<string>();
  (body.userIds ?? []).forEach((id) => id && targetIds.add(id));

  if (tagOptionId) {
    const { data: tagged } = await (supabase as any)
      .from("user_tags")
      .select("user_id")
      .eq("tag_option_id", tagOptionId);
    (tagged ?? []).forEach((t: any) => t.user_id && targetIds.add(t.user_id));
  }

  if (body.emails?.length) {
    const emails = body.emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
    const { data: profs } = await (supabase as any)
      .from("profiles")
      .select("id, email")
      .in("email", emails);
    (profs ?? []).forEach((p: any) => p.id && targetIds.add(p.id));
  }

  const ids = [...targetIds];
  if (ids.length === 0) {
    return NextResponse.json({ error: "Hiç alıcı bulunamadı" }, { status: 400 });
  }

  // ── Ata (varsa atla) + bildir ─────────────────────────────────────────────
  let assigned = 0;
  let emailed = 0;
  const errors: string[] = [];

  for (const userId of ids) {
    const { error } = await (supabase as any)
      .from("user_coupons")
      .upsert({ user_id: userId, coupon_id: couponId }, { onConflict: "user_id,coupon_id", ignoreDuplicates: true });
    if (error) {
      errors.push(`${userId}: ${error.message}`);
      continue;
    }
    assigned++;

    if (notify) {
      const r = await sendCouponAssignedNotification(userId, couponId);
      if (r.status === "sent") emailed++;
    }
  }

  return NextResponse.json({
    ok: true,
    hedef: ids.length,
    atanan: assigned,
    epostaGonderilen: emailed,
    errors: errors.length ? errors : undefined,
  });
}
