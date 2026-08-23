import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { createIyzicoClient, formatPrice, newConversationId } from "@/lib/iyzico";
import { validateCartPricing } from "@/lib/order-pricing";

type CartItem = {
  product_id: string;
  variant_id?: string;
  variant_name?: string;
  title: string;
  price: number;
  quantity: number;
  is_gift?: boolean;
};

export async function POST(req: NextRequest) {
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  const body = await req.json();
  const {
    items,
    shippingAddressId,
    affiliateCode,
    couponCode,
    identityNumber,
  } = body as {
    items: CartItem[];
    shippingAddressId: string;
    affiliateCode?: string;
    couponCode?: string;
    identityNumber: string;
  };

  if (!items?.length || !shippingAddressId) {
    return NextResponse.json({ error: "Eksik bilgi" }, { status: 400 });
  }
  if (!identityNumber || identityNumber.replace(/\D/g, "").length !== 11) {
    return NextResponse.json({ error: "Geçerli bir TC Kimlik No girin." }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Profil bilgilerini çek
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("first_name, last_name, email, phone, identity_number")
    .eq("id", user.id)
    .single() as { data: any };

  // TC'yi profile'a kaydet
  await (supabase as any)
    .from("profiles")
    .update({ identity_number: identityNumber.replace(/\D/g, "") })
    .eq("id", user.id);

  // Teslimat adresini doğrula
  const { data: address } = await supabase
    .from("user_addresses")
    .select("*")
    .eq("id", shippingAddressId)
    .eq("user_id", user.id)
    .single();

  if (!address) return NextResponse.json({ error: "Geçersiz adres" }, { status: 400 });

  // ── GÜVENLİK: Fiyatları sunucuda doğrula (tarayıcıdan gelen price yok sayılır) ──
  const pricing = await validateCartPricing(supabase, items);
  if (!pricing.ok) {
    return NextResponse.json({ error: pricing.error }, { status: 400 });
  }
  const pricedItems = pricing.items;

  // Affiliate
  let affiliateId: string | null = null;
  let commissionRate = 0;
  if (affiliateCode) {
    const { data: aff } = await supabase
      .from("affiliate_profiles")
      .select("id, commission_rate, user_id")
      .eq("code", affiliateCode)
      .eq("status", "active")
      .single();
    if (aff && aff.user_id !== user.id) {
      affiliateId = aff.id;
      commissionRate = Number(aff.commission_rate);
    }
  }

  // Kupon
  let couponId: string | null = null;
  let couponDiscount = 0;
  let freeShipping = false;
  let validatedCoupon: any = null;

  if (couponCode) {
    const { data: coupon } = await supabase
      .from("coupons")
      .select("*")
      .eq("code", couponCode.trim().toUpperCase())
      .eq("is_active", true)
      .single();
    if (coupon && !(coupon.expires_at && new Date(coupon.expires_at) < new Date())) {
      const { data: uc } = await supabase
        .from("user_coupons")
        .select("use_count")
        .eq("user_id", user.id)
        .eq("coupon_id", coupon.id)
        .maybeSingle();
      const useCount = uc?.use_count ?? 0;
      if (
        (coupon.max_uses === null || coupon.used_count < coupon.max_uses) &&
        useCount < coupon.per_user_limit
      ) {
        couponId = coupon.id;
        validatedCoupon = coupon;
        const productTotal0 = pricing.productTotal;
        if (coupon.type === "percentage") {
          couponDiscount = (productTotal0 * coupon.amount) / 100;
          if (coupon.max_discount_amount !== null) couponDiscount = Math.min(couponDiscount, coupon.max_discount_amount);
        } else if (coupon.type === "fixed") {
          couponDiscount = Math.min(coupon.amount, productTotal0);
        } else if (coupon.type === "free_shipping") {
          freeShipping = true;
        }
        couponDiscount = Math.round(couponDiscount * 100) / 100;
      }
    }
  }

  // Tutarlar (doğrulanmış fiyatlardan)
  const productTotal = pricing.productTotal;
  const shippingCost = productTotal > 500 || freeShipping ? 0 : 29.90;
  const totalAmount = Math.max(0, productTotal + shippingCost - couponDiscount);

  const shippingAddressJson = JSON.stringify({
    name: `${address.first_name} ${address.last_name}`,
    phone: address.phone,
    address: address.address_detail,
    district: address.district,
    city: address.city,
  });

  // conversationId → sipariş kaydından önce üret
  const conversationId = newConversationId();

  // Siparişi oluştur (pending — iyzico henüz onaylamadı)
  const { data: order, error: orderError } = await (supabase
    .from("orders")
    .insert({
      user_id: user.id,
      status: "pending",
      total_amount: totalAmount,
      shipping_address: shippingAddressJson,
      affiliate_id: affiliateId,
      coupon_id: couponId,
      coupon_discount: couponDiscount,
      payment_method: "iyzico",
      payment_status: "pending",
      shipment_status: "waiting",
      invoice_status: "pending",
      iyzico_conversation_id: conversationId,
    } as any)
    .select()
    .single() as any) as { data: any; error: any };

  if (orderError || !order) {
    console.error("[iyzico/initialize] orderError:", orderError);
    return NextResponse.json({ error: "Sipariş oluşturulamadı", detail: orderError?.message }, { status: 500 });
  }

  // Sipariş kalemlerini kaydet
  const variantIds = pricedItems.map(i => i.variant_id).filter(Boolean) as string[];
  let skuMap: Record<string, string> = {};
  if (variantIds.length > 0) {
    const { data: variantRows } = await supabase
      .from("product_variants").select("id, sku").in("id", variantIds);
    (variantRows ?? []).forEach((v: any) => { if (v.sku) skuMap[v.id] = v.sku; });
  }

  const orderItems = pricedItems.map((item) => ({
    order_id: order.id,
    product_id: item.product_id,
    quantity: item.quantity,
    unit_price: item.price,
    ...(item.variant_id ? { variant_id: item.variant_id } : {}),
    sku: (item.variant_id ? skuMap[item.variant_id] : undefined) ?? "",
    variant_name: item.variant_name ?? "",
  }));

  const { error: itemsError } = await (supabase.from("order_items").insert(orderItems as any) as any);
  if (itemsError) {
    await supabase.from("orders").delete().eq("id", order.id);
    return NextResponse.json({ error: "Kalemler oluşturulamadı" }, { status: 500 });
  }

  // ── iyzico CheckoutForm Initialize ────────────────────────────────────────
  const iyzipay = createIyzicoClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://yerihisset.com";
  const buyerName  = profile?.first_name || "Ad";
  const buyerSurname = profile?.last_name || "Soyad";
  const buyerEmail = profile?.email || user.email || "";
  const buyerPhone = (profile?.phone || "05000000000").replace(/\s/g, "");

  // ── iyzico sepet kalemleri: toplam mutlaka `price` ile eşleşmeli ──────────
  // Kargo ücretini ayrı kalem olarak ekliyor, kupon indirimini kalemlere
  // orantılı dağıtıyoruz; yuvarlama artığı son kaleme yazılır. Böylece
  // sum(basketItems) === totalAmount (kuruşu kuruşuna) garanti edilir.
  const totalCents = Math.round(totalAmount * 100);
  const lineCents = pricedItems.map((i) => Math.round(i.price * i.quantity * 100));
  const shipCents = Math.round(shippingCost * 100);
  const rawCents = lineCents.reduce((a, b) => a + b, 0) + shipCents;
  const discountCents = Math.max(0, rawCents - totalCents);

  const basketDraft: { _cents: number; id: string; name: string; category1: string; itemType: string }[] =
    pricedItems.map((item, idx) => {
      const base = lineCents[idx];
      const share = rawCents > 0 ? Math.round((base / rawCents) * discountCents) : 0;
      return {
        _cents: Math.max(0, base - share),
        id: item.product_id ?? `item-${idx}`,
        name: item.title.slice(0, 120),
        category1: "Ayakkabı",
        itemType: "PHYSICAL",
      };
    });

  if (shipCents > 0) {
    const share = rawCents > 0 ? Math.round((shipCents / rawCents) * discountCents) : 0;
    basketDraft.push({
      _cents: Math.max(0, shipCents - share),
      id: "shipping",
      name: "Kargo",
      category1: "Kargo",
      itemType: "PHYSICAL",
    });
  }

  // Yuvarlama farkını son kaleme yazarak toplamı totalCents'e birebir eşitle
  if (basketDraft.length > 0) {
    const sumCents = basketDraft.reduce((a, b) => a + b._cents, 0);
    basketDraft[basketDraft.length - 1]._cents += totalCents - sumCents;
    if (basketDraft[basketDraft.length - 1]._cents < 0) basketDraft[basketDraft.length - 1]._cents = 0;
  }

  const iyzicoBasketItems = basketDraft.map((b) => ({
    id: b.id,
    name: b.name,
    category1: b.category1,
    itemType: b.itemType,
    price: (b._cents / 100).toFixed(2),
  }));

  const checkoutRequest: Record<string, unknown> = {
    locale: "tr",
    conversationId,
    price: formatPrice(totalAmount),
    paidPrice: formatPrice(totalAmount),
    currency: "TRY",
    basketId: order.id,
    paymentGroup: "PRODUCT",
    callbackUrl: `${siteUrl}/api/checkout/iyzico/callback`,
    enabledInstallments: [1, 2, 3, 6, 9, 12],
    buyer: {
      id: user.id,
      name: buyerName,
      surname: buyerSurname,
      email: buyerEmail,
      identityNumber: identityNumber.replace(/\D/g, ""),
      registrationAddress: `${address.address_detail} ${address.district} ${address.city}`,
      city: address.city,
      country: "Turkey",
      gsmNumber: buyerPhone.startsWith("+") ? buyerPhone : `+90${buyerPhone.replace(/^0/, "")}`,
    },
    shippingAddress: {
      contactName: `${address.first_name} ${address.last_name}`,
      city: address.city,
      country: "Turkey",
      address: `${address.address_detail} ${address.district} ${address.city}`,
    },
    billingAddress: {
      contactName: `${address.first_name} ${address.last_name}`,
      city: address.city,
      country: "Turkey",
      address: `${address.address_detail} ${address.district} ${address.city}`,
    },
    basketItems: iyzicoBasketItems,
  };

  return new Promise<NextResponse>((resolve) => {
    iyzipay.checkoutFormInitialize.create(checkoutRequest, async (err: any, result: any) => {
      if (err || result?.status !== "success") {
        // Başarısız olursa siparişi iptal et
        await supabase.from("orders").update({ status: "cancelled" }).eq("id", order.id);
        console.error("[iyzico/initialize] iyzico error:", err ?? result);
        resolve(NextResponse.json(
          { error: result?.errorMessage ?? "iyzico bağlantı hatası" },
          { status: 502 }
        ));
        return;
      }

      // Token'ı siparişe kaydet
      await supabase.from("orders").update({
        iyzico_token: result.token,
      } as any).eq("id", order.id);

      resolve(NextResponse.json({
        ok: true,
        orderId: order.id,
        token: result.token,
        checkoutFormContent: result.checkoutFormContent,
      }));
    });
  });
}
