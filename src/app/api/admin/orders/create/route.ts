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

  // ── Online sipariş gibi işle: stok düş + rol + etiket + bildirim ──────────

  // 1) STOK DÜŞÜMÜ (soft — admin siparişi reddedilmez; eksik olursa nota yaz)
  try {
    const { data: reduceRes } = await (supabase as any).rpc("reduce_order_stock", {
      p_order_id: order.id, p_strict: false,
    });
    const shortages = reduceRes?.shortages;
    if (Array.isArray(shortages) && shortages.length > 0) {
      const note = (admin_note ? admin_note + "\n" : "") + "⚠ STOK EKSİĞİ: " + shortages
        .map((s: any) => `${s.title || s.product_id} (gereken ${s.needed}, mevcut ${s.available})`).join("; ");
      await (supabase as any).from("orders").update({ admin_note: note }).eq("id", order.id);
    }
  } catch (e) {
    console.error("[admin/orders/create] stok düşümü:", e);
  }

  // 2) Müşteri rolü ata
  const { assignRole } = await import("@/lib/user-roles");
  await assignRole(customer_id, "musteri");

  // 3) Otomatik üye etiketleri (kategori / marka / varyasyon)
  try {
    const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))];
    const variantIds = [...new Set(items.map((i) => i.variant_id).filter(Boolean) as string[])];

    const { data: orderedProducts } = productIds.length > 0
      ? await supabase.from("products").select("id, brands(name), categories(name)").in("id", productIds)
      : { data: [] as any[] };
    const { data: orderedVariants } = variantIds.length > 0
      ? await supabase.from("product_variants").select("id, variant_options(value, variant_groups(name))").in("id", variantIds)
      : { data: [] as any[] };

    const tagEntries: { groupName: string; value: string }[] = [];
    (orderedProducts ?? []).forEach((p: any) => {
      if (p.categories?.name) tagEntries.push({ groupName: "Kategori", value: p.categories.name });
      if (p.brands?.name)     tagEntries.push({ groupName: "Marka",    value: p.brands.name });
    });
    (orderedVariants ?? []).forEach((v: any) => {
      const opt = v.variant_options;
      if (opt?.value && opt?.variant_groups?.name) tagEntries.push({ groupName: opt.variant_groups.name, value: opt.value });
    });

    const uniqueTags = [...new Map(tagEntries.map((t) => [`${t.groupName}::${t.value}`, t])).values()];
    if (uniqueTags.length > 0) {
      const groupNames = [...new Set(uniqueTags.map((t) => t.groupName))];
      await supabase.from("member_tag_groups").upsert(groupNames.map((name) => ({ name })), { onConflict: "name", ignoreDuplicates: true });
      const { data: groups } = await supabase.from("member_tag_groups").select("id, name").in("name", groupNames);
      const groupMap = new Map((groups ?? []).map((g: any) => [g.name, g.id]));
      const optionRows = uniqueTags.map((t) => ({ group_id: groupMap.get(t.groupName), value: t.value })).filter((r) => r.group_id) as { group_id: string; value: string }[];
      await supabase.from("member_tag_options").upsert(optionRows, { onConflict: "group_id,value", ignoreDuplicates: true });
      const { data: options } = await supabase.from("member_tag_options").select("id, group_id, value").in("group_id", [...groupMap.values()]);
      const neededOptionIds = (options ?? [])
        .filter((o: any) => uniqueTags.some((t) => groupMap.get(t.groupName) === o.group_id && t.value === o.value))
        .map((o: any) => o.id);
      if (neededOptionIds.length > 0) {
        await supabase.from("user_tags").upsert(
          neededOptionIds.map((id: string) => ({ user_id: customer_id, tag_option_id: id })),
          { onConflict: "user_id,tag_option_id", ignoreDuplicates: true }
        );
      }
    }
  } catch (e) {
    console.error("[admin/orders/create] etiket atama:", e);
  }

  // 4) Sipariş bildirimi (online akıştaki gibi)
  try {
    const { sendOrderNotification } = await import("@/lib/notifications");
    sendOrderNotification("order_placed", { orderId: order.id, userId: customer_id }).catch(() => {});
  } catch { /* yoksay */ }

  return NextResponse.json({ orderId: order.id, orderNumber: order.order_number });
}
