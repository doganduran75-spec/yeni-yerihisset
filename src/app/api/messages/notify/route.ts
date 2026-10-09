import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendMessageNotification } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase-admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Mesaj gönderildikten sonra karşı tarafa e-posta bildirimi tetikler.
// Girişli kullanıcı gerektirir (aç ık spam engeli). İçerik sunucudan üretilir.
export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { user } } = await anon.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const orderId = String(body.orderId || "");
  const senderRole = body.senderRole === "admin" ? "admin" : body.senderRole === "user" ? "user" : null;
  if (!orderId || !senderRole) return NextResponse.json({ error: "Eksik parametre" }, { status: 400 });
  // GÜVENLİK: yalnız siparişin sahibi (müşteri mesajı) ya da yönetici (yönetici mesajı) tetikleyebilir —
  // aksi halde herhangi bir hesap başkasının siparişi için "yeni mesaj" e-postası gönderebiliyordu.
  const sb = createAdminClient() as any;
  const [{ data: ord }, { data: me }] = await Promise.all([
    sb.from("orders").select("user_id").eq("id", orderId).maybeSingle(),
    sb.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);
  if (!ord) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
  const allowed = senderRole === "admin" ? me?.role === "admin" : ord.user_id === user.id;
  if (!allowed) return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  // Bildirim kritik değil — hata olsa da mesaj zaten kaydedildi.
  try {
    const res = await sendMessageNotification(orderId, senderRole);
    return NextResponse.json(res);
  } catch (e: any) {
    console.error("[messages/notify]", e?.message || e);
    return NextResponse.json({ status: "failed" }, { status: 200 });
  }
}
