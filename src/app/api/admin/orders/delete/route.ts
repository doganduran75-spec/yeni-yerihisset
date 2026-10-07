import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { restoreOrderCredit } from "@/lib/store-credit";
import { kickMarketplaceSync } from "@/lib/marketplace/sync";

/* eslint-disable @typescript-eslint/no-explicit-any */

// SİPARİŞİ KALICI SİL — test siparişleri için (sipariş detayındaki "Siparişi sil").
// Yalnız SİTEDE verilmiş siparişler: aktarılan (WooCommerce) ve pazaryeri siparişleri silinemez
// (pazaryeri siparişi bir sonraki çekmede zaten geri gelir).
// Silmeden önce: düşülen stok geri eklenir (ürün depodan çıkmadıysa — kargolanmışsa eklenmez),
// kullanılan YeriHisset Kredisi cüzdana döner. Kalemler, süreç geçmişi, mesajlar, yorumlar,
// komisyonlar siparişle birlikte silinir (veritabanı CASCADE). Kupon kullanım sayısı yeniden hesaplanır.
// Gerçek siparişte para iadesi YAPILMAZ — gerçek sipariş silinmez, iptal edilir.
export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const sb = createAdminClient() as any;
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const { orderId } = (await req.json().catch(() => ({}))) as { orderId?: string };
  if (!orderId) return NextResponse.json({ error: "orderId gerekli" }, { status: 400 });

  const { data: o } = await sb.from("orders")
    .select("id, order_number, channel, import_source, stock_reduced_at, shipment_status, coupon_id")
    .eq("id", orderId).maybeSingle();
  if (!o) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
  if ((o.channel || "site") !== "site" || o.import_source) {
    return NextResponse.json({ error: "Yalnız sitede verilmiş siparişler silinebilir (aktarılan ve pazaryeri siparişleri silinemez)." }, { status: 400 });
  }

  // 1) Stok: ürün depodan çıkmadıysa geri ekle
  const goodsLeft = ["shipped", "delivered", "undelivered", "returned"].includes(o.shipment_status || "");
  let restocked = false;
  if (o.stock_reduced_at && !goodsLeft) {
    const { error } = await sb.rpc("restore_order_stock", { p_order_id: o.id });
    if (error) return NextResponse.json({ error: `Stok geri eklenemedi: ${error.message}` }, { status: 500 });
    restocked = true;
  }
  // 2) YeriHisset Kredisi cüzdana
  await restoreOrderCredit(sb, o.id).catch(() => {});

  // 3) Sil (bağlı kayıtlar CASCADE)
  await sb.from("messages").delete().eq("order_id", o.id);
  const { error: delErr } = await sb.from("orders").delete().eq("id", o.id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  // 4) Kupon kullanım sayısı
  if (o.coupon_id) {
    const { count } = await sb.from("orders").select("id", { count: "exact", head: true })
      .eq("coupon_id", o.coupon_id).neq("status", "cancelled");
    await sb.from("coupons").update({ used_count: count ?? 0 }).eq("id", o.coupon_id);
  }

  if (restocked) kickMarketplaceSync(500);
  console.log(`[orders/delete] YH${o.order_number} silindi (admin ${user.id}; stok ${restocked ? "geri eklendi" : "değişmedi"})`);
  return NextResponse.json({ ok: true, restocked, goodsLeft });
}
