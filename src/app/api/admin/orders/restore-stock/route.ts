import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";

/**
 * Sipariş iptal edildiğinde düşülen stoğu geri yükler.
 * Yalnızca admin çağırabilir. reduce/restore fonksiyonları idempotent olduğu için
 * hiç stok düşülmemiş siparişte no-op'tur (stock_reduced_at null ise dokunmaz).
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const supabase = createAdminClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const { orderId } = (await req.json()) as { orderId?: string };
  if (!orderId) return NextResponse.json({ error: "orderId zorunlu" }, { status: 400 });

  const { data, error } = await (supabase as any).rpc("restore_order_stock", { p_order_id: orderId });
  if (error) {
    console.error("[restore-stock] hata:", error);
    return NextResponse.json({ error: "Stok geri yüklenemedi" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, result: data });
}
