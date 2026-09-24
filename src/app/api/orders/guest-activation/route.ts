import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendGuestActivationEmail } from "@/lib/notifications";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Misafir sipariş başarı ekranındaki "E-posta gelmedi mi? Tekrar gönder".
// Bağlantı yalnızca siparişin KENDİ sahibinin e-postasına gider (başkasına
// yönlendirilemez); son 30 günün siparişleriyle sınırlı.
export async function POST(req: NextRequest) {
  const { orderId } = (await req.json().catch(() => ({}))) as { orderId?: string };
  if (!orderId) return NextResponse.json({ error: "Eksik bilgi" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: order } = await (supabase as any)
    .from("orders").select("id, user_id, order_number, created_at").eq("id", orderId).maybeSingle();
  if (!order) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
  if (Date.now() - new Date(order.created_at).getTime() > 30 * 24 * 3600_000) {
    return NextResponse.json({ error: "Bu sipariş için bağlantı süresi doldu; giriş ekranındaki “Şifremi unuttum”u kullan." }, { status: 400 });
  }

  const { data: profile } = await (supabase as any)
    .from("profiles").select("email, first_name").eq("id", order.user_id).maybeSingle();
  if (!profile?.email) return NextResponse.json({ error: "E-posta bulunamadı" }, { status: 404 });

  const res = await sendGuestActivationEmail({
    email: profile.email,
    name: profile.first_name ?? null,
    orderLabel: order.order_number ? `YH${order.order_number}` : null,
  });
  if (res.status !== "sent") return NextResponse.json({ error: "E-posta gönderilemedi, lütfen biraz sonra tekrar dene." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
