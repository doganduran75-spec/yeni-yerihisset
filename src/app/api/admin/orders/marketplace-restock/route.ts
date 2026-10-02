import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { restockReturnedOrder } from "@/lib/marketplace/orders";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Pazaryeri siparişi İADE geldi (ürün depoya döndü) → admin onayıyla stoğa geri ekle.
// Kalem bazında tek seferlik (mp_restore_item_stock); yeni stok tüm pazaryerlerine gider.
export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const supabase = createAdminClient();
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((me as any)?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const { orderId } = (await req.json().catch(() => ({}))) as { orderId?: string };
  if (!orderId) return NextResponse.json({ error: "orderId gerekli" }, { status: 400 });
  const { data: order } = await (supabase as any).from("orders").select("id, channel").eq("id", orderId).maybeSingle();
  if (!order || order.channel === "site") return NextResponse.json({ error: "Pazaryeri siparişi bulunamadı" }, { status: 404 });

  const restored = await restockReturnedOrder(orderId, supabase);
  return NextResponse.json({ ok: true, restored });
}
