import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";

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
  } = body as {
    customer_id: string;
    shipping_address_id: string;
    items: NewOrderItem[];
    payment_method?: string;
    admin_note?: string;
    coupon_discount?: number;
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
  const shippingCost = productTotal >= 500 ? 0 : 29.90;
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

  // Müşteri rolü ata
  const { assignRole } = await import("@/lib/user-roles");
  await assignRole(customer_id, "musteri");

  return NextResponse.json({ orderId: order.id, orderNumber: order.order_number });
}
