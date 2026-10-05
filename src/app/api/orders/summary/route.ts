import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { rateLimited, clientIp, TOO_MANY } from "@/lib/rate-limit";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Kartla ödeme sonrası /siparis-tamam ekranı. Misafir oturum açmadığı için siparişi
// RLS yüzünden kendisi okuyamaz → özet sunucuda okunur. Sipariş kimliği (UUID) yalnız
// iyzico dönüşünde verilir; yine de son 3 günle sınırlı ve e-posta maskelidir.
const WINDOW_MS = 3 * 24 * 3600_000;

function maskEmail(e: string): string {
  const [u, d] = e.split("@");
  if (!d) return "";
  return `${u.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, u.length - 2)))}@${d}`;
}

export async function GET(req: NextRequest) {
  if (rateLimited("order-summary", clientIp(req), 30, 600000)) return NextResponse.json(TOO_MANY, { status: 429 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Geçersiz" }, { status: 400 });

  const sb = createAdminClient() as any;
  const { data: o } = await sb
    .from("orders")
    .select("id, user_id, order_number, total_amount, shipping_cost, payment_method, payment_status, status, created_at, order_items(product_id, unit_price, quantity, variant_name, products(title))")
    .eq("id", id)
    .maybeSingle();
  if (!o || Date.now() - new Date(o.created_at).getTime() > WINDOW_MS) {
    return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
  }

  const { data: prof } = await sb.from("profiles").select("email").eq("id", o.user_id).maybeSingle();
  const email: string = prof?.email ?? "";
  let isGuest = false;
  if (email) {
    const { data: st } = await sb.rpc("account_password_state", { p_email: email });
    isGuest = st === "passwordless";
  }

  return NextResponse.json({
    ok: true,
    orderNumber: o.order_number ?? null,
    total: Number(o.total_amount),
    shipping: Number(o.shipping_cost ?? 0),
    paymentMethod: o.payment_method,
    paid: o.payment_status === "paid",
    cancelled: o.status === "cancelled",
    email: email ? maskEmail(email) : null,
    isGuest,
    items: (o.order_items ?? []).map((i: any) => ({
      id: i.product_id,
      title: i.products?.title ?? "",
      variant_name: i.variant_name ?? "",
      price: Number(i.unit_price),
      quantity: i.quantity,
    })),
  });
}
