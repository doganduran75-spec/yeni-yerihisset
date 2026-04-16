import { NextRequest } from "next/server";
import { sendOrderNotification, NotificationTrigger } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase-admin";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const VALID_TRIGGERS: NotificationTrigger[] = [
  "order_placed",
  "order_paid",
  "order_shipped",
  "order_delivered",
  "order_cancelled",
];

export async function POST(request: NextRequest) {
  // Çağıranın admin olup olmadığını doğrula
  try {
    const cookieStore = await cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const userClient = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    });

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return Response.json({ error: "Yetkisiz" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return Response.json({ error: "Yalnızca adminler bildirim gönderebilir" }, { status: 403 });
    }
  } catch {
    return Response.json({ error: "Auth kontrolü başarısız" }, { status: 500 });
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
