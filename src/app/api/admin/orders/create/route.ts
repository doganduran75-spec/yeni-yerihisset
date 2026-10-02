import { NextRequest, NextResponse } from "next/server";
import { kickMarketplaceSync } from "@/lib/marketplace/sync";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { resolveShipping } from "@/lib/shipping";

type NewOrderItem = {
  product_id: string;
  variant_id?: string | null;
  variant_name?: string;
  sku?: string;
  title: string;
  quantity: number;
  unit_price: number;
};

export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const supabase = createAdminClient();

  // Admin kontrolü
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Sadece adminler sipariş oluşturabilir" }, { status: 403 });
  }

  const body = await req.json();
  const {
    customer_id,
    shipping_address_id,
    items,
    payment_method = "credit_card",
    admin_note = "",
    coupon_discount = 0,
    shipping_method_id = null,
    free_shipping = false,
    send_activation = false,
  } = body as {
    customer_id: string;
    shipping_address_id: string;
    items: NewOrderItem[];
    payment_method?: string;
    admin_note?: string;
    coupon_discount?: number;
    shipping_method_id?: string | null;
    free_shipping?: boolean;
    send_activation?: boolean; // müşteri bu pencerede yeni eklendiyse: şifre belirleme e-postası
  };

  if (!customer_id || !shipping_address_id || !items?.length) {
    return NextResponse.json({ error: "Eksik bilgi" }, { status: 400 });
  }

  // Adresi çek
  const { data: address } = await supabase
    .from("user_addresses")
    .select("*")
    .eq("id", shipping_address_id)
    .single();

  if (!address) {
    return NextResponse.json({ error: "Adres bulunamadı" }, { status: 400 });
  }

  const productTotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  // Kargo: sitedeki kargo yöntemi kuralıyla (checkout ile aynı; free_over eşiği dahil)
  const shipInfo = await resolveShipping(supabase, shipping_method_id, productTotal, !!free_shipping);
  const shippingCost = shipInfo.cost;
  const totalAmount = Math.max(0, productTotal + shippingCost - coupon_discount);

  const shippingAddressJson = JSON.stringify({
    name: `${address.first_name} ${address.last_name}`,
    phone: address.phone,
    address: address.address_detail,
    district: address.district,
    city: address.city,
  });

  const isBankTransfer = payment_method === "bank_transfer";

  const { data: order, error: orderError } = await (supabase
    .from("orders")
    .insert({
      user_id: customer_id,
      status: isBankTransfer ? "awaiting_payment" : "processing",
      total_amount: totalAmount,
      shipping_address: shippingAddressJson,
      shipping_method: shipInfo.name,
      shipping_cost: shippingCost,
      payment_method,
      payment_status: isBankTransfer ? "pending" : "paid",
      shipment_status: "preparing",
      invoice_status: "pending",
      admin_note,
    } as any)
    .select()
    .single() as any) as { data: any; error: any };

  if (orderError || !order) {
    console.error("[admin/orders/create]", orderError);
    return NextResponse.json({ error: "Sipariş oluşturulamadı", detail: orderError?.message }, { status: 500 });
  }

  const orderItems = items.map((item) => ({
    order_id: order.id,
    product_id: item.product_id,
    variant_id: item.variant_id ?? null,
    sku: item.sku ?? "",
    variant_name: item.variant_name ?? "",
    quantity: item.quantity,
    unit_price: item.unit_price,
  }));

  const { error: itemsError } = await (supabase
    .from("order_items")
    .insert(orderItems as any) as any);

  if (itemsError) {
    await supabase.from("orders").delete().eq("id", order.id);
    return NextResponse.json({ error: "Kalemler oluşturulamadı", detail: itemsError?.message }, { status: 500 });
  }

  // ── Online sipariş gibi işle: stok düş + rol + etiket + bildirim ──────────

  // 1) STOK DÜŞÜMÜ (soft — admin siparişi reddedilmez; eksik olursa nota yaz)
  try {
    const { data: reduceRes } = await (supabase as any).rpc("reduce_order_stock", {
      p_order_id: order.id, p_strict: false,
    });
    kickMarketplaceSync(); // stok değişti → pazaryerlerine (Trendyol) gönder
    const shortages = reduceRes?.shortages;
    if (Array.isArray(shortages) && shortages.length > 0) {
      const note = (admin_note ? admin_note + "\n" : "") + "⚠ STOK EKSİĞİ: " + shortages
        .map((s: any) => `${s.title || s.product_id} (gereken ${s.needed}, mevcut ${s.available})`).join("; ");
      await (supabase as any).from("orders").update({ admin_note: note }).eq("id", order.id);
    }
  } catch (e) {
    console.error("[admin/orders/create] stok düşümü:", e);
  }

  // Müşteri rolü + otomatik etiketler (kategori / marka / numara) artık VERİTABANINDA:
  // sipariş ÖDENİNCE tetikleyici atar (refresh_member_auto_tags, migration 20261015000001).
  // Ödenmemiş havale siparişi rol kazandırmaz; aktarılan/pazaryeri siparişlerinde de aynı kural.

  // 4) Sipariş bildirimi (online akıştaki gibi). Yeni eklenen müşteriye, sipariş
  // e-postasından SONRA hesap aktivasyonu (şifre belirleme) e-postası gider.
  try {
    const { sendOrderNotification, sendGuestActivationEmail } = await import("@/lib/notifications");
    const { data: cust } = send_activation
      ? await supabase.from("profiles").select("email, first_name").eq("id", customer_id).maybeSingle()
      : { data: null };
    sendOrderNotification("order_placed", { orderId: order.id, userId: customer_id })
      .catch(() => {})
      .then(() => {
        if (!cust?.email) return;
        return sendGuestActivationEmail({
          email: cust.email,
          name: cust.first_name ?? null,
          orderLabel: order.order_number ? `YH${order.order_number}` : null,
        }).then((r) => { if (r.status !== "sent") console.error("[admin-order activation]", r.error); });
      })
      .catch((e) => console.error("[admin-order activation]", e?.message || e));
  } catch { /* yoksay */ }

  return NextResponse.json({ orderId: order.id, orderNumber: order.order_number });
}
