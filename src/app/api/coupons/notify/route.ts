import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { sendCouponAssignedNotification } from "@/lib/notifications";

/**
 * Bir üyeye kupon atandığında "Yeni Kupon Tanımlandı" e-postası gönderir.
 * Yalnızca admin çağırabilir. E-posta gönderimi SMTP gerektirdiği için sunucuda.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const supabase = createAdminClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const { userId, couponId } = (await req.json()) as { userId?: string; couponId?: string };
  if (!userId || !couponId) {
    return NextResponse.json({ error: "userId ve couponId zorunlu" }, { status: 400 });
  }

  const result = await sendCouponAssignedNotification(userId, couponId);
  return NextResponse.json(result);
}
