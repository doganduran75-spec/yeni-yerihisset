import { NextRequest } from "next/server";
import { sendOrderNotification, NotificationTrigger } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";

const VALID_TRIGGERS: NotificationTrigger[] = [
  "order_placed",
  "order_paid",
  "order_shipped",
  "order_delivered",
  "order_cancelled",
];

export async function POST(request: NextRequest) {
  // Bearer token ile kullanıcıyı doğrula
  const user = await getAuthUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "Yetkisiz" }, { status: 401 });
  }

  // Admin rolü kontrolü
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return Response.json({ error: "Yalnızca adminler bildirim gönderebilir" }, { status: 403 });
  }

  // Body'yi parse et
  let body: { trigger: string; orderId: string; userId: string; trackingNumber?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Geçersiz JSON" }, { status: 400 });
  }

  const { trigger, orderId, userId, trackingNumber } = body;

  if (!trigger || !VALID_TRIGGERS.includes(trigger as NotificationTrigger)) {
    return Response.json({ error: "Geçersiz trigger" }, { status: 400 });
  }
  if (!orderId || !userId) {
    return Response.json({ error: "orderId ve userId zorunlu" }, { status: 400 });
  }

  const result = await sendOrderNotification(trigger as NotificationTrigger, {
    orderId,
    userId,
    trackingNumber,
  });

  return Response.json(result);
}
