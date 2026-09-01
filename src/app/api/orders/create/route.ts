import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
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
  if (!user) {
    return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  }

  const body = await req.json();
  const { items, shippingAddressId, affiliateCode, couponCode, paymentMethod } = body as {
    items: CartItem[];
    shippingAddressId: string;
    affiliateCode?: string;
    couponCode?: string;
    paymentMethod?: string;
  };

  if (!items?.length || !shippingAddressId) {
    return NextResponse.json({ error: "Eksik bilgi" }, { status: 400 });
  }

  // ── GÜVENLİK: Bu uç yalnızca havale/EFT içindir. Kartlı ödeme iyzico
  // (/api/checkout/iyzico/initialize) üzerinden gerçek tahsilatla yapılır.
  // Aksi halde ödeme yapılmadan sipariş "ödendi" işaretlenebilirdi.
  if (paymentMethod !== "bank_transfer") {
    return NextResponse.json(
      { error: "Bu ödeme yöntemi desteklenmiyor. Kartlı ödeme için iyzico akışını kullanın." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Teslimat adresini doğrula
  const { data: address } = await supabase
    .from("user_addresses")
    .select("*")
    .eq("id", shippingAddressId)
    .eq("user_id", user.id)
    .single();

  if (!address) {
    return NextResponse.json({ error: "Geçersiz adres" }, { status: 400 });
  }

  // ── GÜVENLİK: Fiyatları sunucuda doğrula (tarayıcıdan gelen price yok sayılır) ──
  const pricing = await validateCartPricing(supabase, items);
  if (!pricing.ok) {
    return NextResponse.json({ error: pricing.error }, { status: 400 });
  }
  const pricedItems = pricing.items;

  // Affiliate kodu varsa affiliate profili bul
  let affiliateId: string | null = null;
  let commissionRate = 0;
  if (affiliateCode) {
    const { data: aff } = await supabase
      .from("affiliate_profiles")
      .select("id, commission_rate, user_id")
      .eq("code", affiliateCode)
      .eq("status", "active")
      .single();

    // Kullanıcı kendi linki üzerinden alışveriş yapıyorsa saymıyoruz
    if (aff && aff.user_id !== user.id) {
      affiliateId = aff.id;
      commissionRate = Number(aff.commission_rate);
    }
  }

  // Kupon doğrulama
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
      // Kişi başı limit kontrolü
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

  // Toplam tutarı hesapla (doğrulanmış fiyatlardan)
  const productTotal = pricing.productTotal;
  const shippingCost = (productTotal > 500 || freeShipping) ? 0 : 29.90;
  const totalAmount = productTotal + shippingCost - couponDiscount;

  // Adres bilgisi (JSON olarak sakla)
  const shippingAddressJson = JSON.stringify({
    name: `${address.first_name} ${address.last_name}`,
    phone: address.phone,
    address: address.address_detail,
    district: address.district,
    city: address.city,
  });

  // Ödeme yöntemine göre başlangıç durumları
  const isBankTransfer = paymentMethod === "bank_transfer";
  // Eski tek kolon (geriye dönük uyumluluk)
  const initialStatus = isBankTransfer ? "awaiting_payment" : "pending";
  // Yeni 3 boyutlu durum
  const initialPaymentStatus  = isBankTransfer ? "pending" : "paid";
  const initialShipmentStatus = isBankTransfer ? "waiting" : "preparing";
  const initialInvoiceStatus  = "pending";

  // Siparişi oluştur
  const { data: order, error: orderError } = await (supabase
    .from("orders")
    .insert({
      user_id: user.id,
      status: initialStatus,
      total_amount: Math.max(0, totalAmount),
      shipping_address: shippingAddressJson,
      affiliate_id: affiliateId,
      coupon_id: couponId,
      coupon_discount: couponDiscount,
      payment_method: paymentMethod ?? "credit_card",
      payment_status:  initialPaymentStatus,
      shipment_status: initialShipmentStatus,
      invoice_status:  initialInvoiceStatus,
    } as any)
    .select()
    .single() as any) as { data: any; error: any };

  if (orderError || !order) {
    console.error("[orders/create] orderError:", JSON.stringify(orderError));
    return NextResponse.json({ error: "Sipariş oluşturulamadı", detail: orderError?.message ?? "unknown" }, { status: 500 });
  }

  // Varyasyon SKU'larını toplu çek (sku lookup için)
  const variantIds = pricedItems.map(i => i.variant_id).filter(Boolean) as string[];
  let skuMap: Record<string, string> = {};
  if (variantIds.length > 0) {
    const { data: variantRows } = await supabase
      .from("product_variants")
      .select("id, sku")
      .in("id", variantIds);
    (variantRows ?? []).forEach((v: any) => { if (v.sku) skuMap[v.id] = v.sku; });
  }

  // Sipariş kalemlerini oluştur
  const orderItems = pricedItems.map((item) => ({
    order_id: order.id,
    product_id: item.product_id,
    quantity: item.quantity,
    unit_price: item.price,
    ...(item.variant_id ? { variant_id: item.variant_id } : {}),
    sku: (item.variant_id ? skuMap[item.variant_id] : undefined) ?? "",
    variant_name: item.variant_name ?? "",
  }));

  const { error: itemsError } = await (supabase
    .from("order_items")
    .insert(orderItems as any) as any);

  if (itemsError) {
    console.error("[orders/create] itemsError:", JSON.stringify(itemsError));
    // Rollback: siparişi sil
    await supabase.from("orders").delete().eq("id", order.id);
    return NextResponse.json({ error: "Sipariş kalemleri oluşturulamadı", detail: itemsError?.message ?? "unknown" }, { status: 500 });
  }

  // ── STOK DÜŞÜMÜ (oversell guard) ──────────────────────────────────────────
  // Havale siparişinde para henüz alınmadığı için stok yetmezse siparişi
  // reddediyoruz (strict). Böylece aynı son ürünü iki kişi birden satın alamaz.
  const { data: reduceRes, error: reduceErr } = await (supabase as any).rpc(
    "reduce_order_stock",
    { p_order_id: order.id, p_strict: true }
  );
  if (reduceErr || !reduceRes?.ok) {
    // Rollback: kalemleri ve siparişi sil (kupon/etiket henüz işlenmedi)
    await supabase.from("order_items").delete().eq("order_id", order.id);
    await supabase.from("orders").delete().eq("id", order.id);
    const msg = String(reduceErr?.message ?? "");
    const soldOut = msg.includes("INSUFFICIENT_STOCK");
    console.error("[orders/create] stok düşümü başarısız:", msg);
    return NextResponse.json(
      {
        error: soldOut
          ? "Üzgünüz, sepetinizdeki bir ürün az önce tükendi. Lütfen sepetinizi güncelleyip tekrar deneyin."
          : "Sipariş oluşturulurken bir stok hatası oluştu.",
      },
      { status: 409 }
    );
  }

  // Affiliate komisyonu kaydet
  if (affiliateId && commissionRate > 0) {
    const commissionAmount = (totalAmount * commissionRate) / 100;
    await supabase.from("affiliate_conversions").insert({
      affiliate_id: affiliateId,
      order_id: order.id,
      order_amount: totalAmount,
      commission_rate: commissionRate,
      commission_amount: commissionAmount,
      status: "pending",
    });
  }

  // Kupon kullanımını kaydet
  if (couponId && validatedCoupon) {
    const now = new Date().toISOString();
    // Toplam kupon kullanım sayısını artır
    await supabase.from("coupons")
      .update({ used_count: validatedCoupon.used_count + 1, updated_at: now })
      .eq("id", couponId);
    // Kullanıcı-kupon kaydı: yoksa oluştur, varsa use_count'ı artır
    const { data: ucExisting } = await supabase.from("user_coupons")
      .select("id, use_count")
      .eq("user_id", user.id)
      .eq("coupon_id", couponId)
      .maybeSingle();
    if (ucExisting) {
      await supabase.from("user_coupons").update({
        use_count: ucExisting.use_count + 1,
        last_used_at: now,
        last_order_id: order.id,
      }).eq("id", ucExisting.id);
    } else {
      await supabase.from("user_coupons").insert({
        user_id: user.id,
        coupon_id: couponId,
        use_count: 1,
        last_used_at: now,
        last_order_id: order.id,
      });
    }
  }

  // İlk alışverişte Müşteri rolünü otomatik ata
  const { assignRole } = await import("@/lib/user-roles");
  await assignRole(user.id, "musteri");

  // ── Otomatik üye etiketi atama ──────────────────────────────────────────
  // Sipariş edilen ürünlerin kategori, marka ve varyasyon değerlerinden
  // otomatik etiket oluşturulur ve müşteriye atanır.
  // Örnek: 36 numara Dodura Ayakkabı → "Kategori: Ayakkabı", "Marka: Dodura", "Beden: 36"

  const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))];
  const tagVariantIds = [...new Set(items.map((i) => i.variant_id).filter(Boolean) as string[])];

  // Ürün detaylarını çek (marka + kategori)
  const { data: orderedProducts } = productIds.length > 0
    ? await supabase
        .from("products")
        .select("id, brands(name), categories(name)")
        .in("id", productIds)
    : { data: [] as any[] };

  // Varyasyon detaylarını çek (seçenek değeri + grup adı)
  const { data: orderedVariants } = tagVariantIds.length > 0
    ? await supabase
        .from("product_variants")
        .select("id, variant_options(value, variant_groups(name))")
        .in("id", tagVariantIds)
    : { data: [] as any[] };

  // Tag listesi oluştur: { groupName, value }
  type TagEntry = { groupName: string; value: string };
  const tagEntries: TagEntry[] = [];

  (orderedProducts ?? []).forEach((p: any) => {
    if (p.categories?.name) tagEntries.push({ groupName: "Kategori", value: p.categories.name });
    if (p.brands?.name)     tagEntries.push({ groupName: "Marka",    value: p.brands.name });
  });

  (orderedVariants ?? []).forEach((v: any) => {
    const opt = v.variant_options;
    if (opt?.value && opt?.variant_groups?.name) {
      tagEntries.push({ groupName: opt.variant_groups.name, value: opt.value });
    }
  });

  // Tekrarları kaldır
  const uniqueTagEntries = [
    ...new Map(tagEntries.map((t) => [`${t.groupName}::${t.value}`, t])).values(),
  ];

  if (uniqueTagEntries.length > 0) {
    const groupNames = [...new Set(uniqueTagEntries.map((t) => t.groupName))];

    // 1. Tag gruplarını bul veya oluştur
    await supabase
      .from("member_tag_groups")
      .upsert(groupNames.map((name) => ({ name })), { onConflict: "name", ignoreDuplicates: true });

    const { data: groups } = await supabase
      .from("member_tag_groups")
      .select("id, name")
      .in("name", groupNames);

    const groupMap = new Map((groups ?? []).map((g: any) => [g.name, g.id]));

    // 2. Tag seçeneklerini bul veya oluştur
    const optionRows = uniqueTagEntries
      .map((t) => ({ group_id: groupMap.get(t.groupName), value: t.value }))
      .filter((r) => r.group_id) as { group_id: string; value: string }[];

    await supabase
      .from("member_tag_options")
      .upsert(optionRows, { onConflict: "group_id,value", ignoreDuplicates: true });

    // 3. ID'leri al
    const { data: options } = await supabase
      .from("member_tag_options")
      .select("id, group_id, value")
      .in("group_id", [...groupMap.values()]);

    const neededOptionIds = (options ?? [])
      .filter((o: any) =>
        uniqueTagEntries.some(
          (t) => groupMap.get(t.groupName) === o.group_id && t.value === o.value
        )
      )
      .map((o: any) => o.id);

    // 4. Kullanıcıya ata
    if (neededOptionIds.length > 0) {
      await supabase.from("user_tags").upsert(
        neededOptionIds.map((id: string) => ({ user_id: user.id, tag_option_id: id })),
        { onConflict: "user_id,tag_option_id", ignoreDuplicates: true }
      );
    }
  }

  // Sipariş oluşturma bildirimi gönder (non-blocking, doğrudan lib çağrısı)
  const { sendOrderNotification } = await import("@/lib/notifications");
  sendOrderNotification("order_placed", { orderId: order.id, userId: user.id }).catch(() => {});

  return NextResponse.json({ orderId: order.id });
}
