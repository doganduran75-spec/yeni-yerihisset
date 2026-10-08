import { NextRequest, NextResponse } from "next/server";
import { kickMarketplaceSync } from "@/lib/marketplace/sync";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { validateCartPricing } from "@/lib/order-pricing";
import { evaluateCoupon } from "@/lib/coupon-rules";
import { resolveCreditApply, deductCreditForOrder } from "@/lib/store-credit";
import { resolveGuest, type GuestInput } from "@/lib/guest-checkout";
import { rateLimited, clientIp, TOO_MANY } from "@/lib/rate-limit";
import { botVerdict, botResponse } from "@/lib/bot-guard";
import { resolveShipping } from "@/lib/shipping";

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
  const authUser = await getAuthUserFromRequest(req);

  const body = await req.json();
  // Misafir: IP sınırı + bot koruması (sahte sipariş stok ayırıp hesap açmasın)
  if (!authUser) {
    if (rateLimited("guest-order", clientIp(req), 10, 3600000)) return NextResponse.json(TOO_MANY, { status: 429 });
    const g = (body?.guest || {}) as GuestInput;
    const blocked = botResponse("guest-order", botVerdict(body, { texts: [g.firstName, g.lastName, g.addressDetail], gibberish: "invalid", minMs: 4000 }), clientIp(req));
    if (blocked) return blocked;
  }
  const { items, shippingAddressId, billingAddressId, billingSameAsShipping, affiliateCode, couponCode, paymentMethod, creditApply, guest, shippingMethodId } = body as {
    items: CartItem[];
    shippingAddressId?: string;
    billingAddressId?: string | null;
    billingSameAsShipping?: boolean;
    affiliateCode?: string;
    couponCode?: string;
    paymentMethod?: string;
    creditApply?: number;
    guest?: GuestInput;
    shippingMethodId?: string;
  };

  if (!items?.length) {
    return NextResponse.json({ error: "Eksik bilgi" }, { status: 400 });
  }

  // ── GÜVENLİK: Bu uç yalnızca havale/EFT içindir. Kartlı ödeme iyzico
  // (/api/checkout/iyzico/initialize) üzerinden gerçek tahsilatla yapılır.
  if (paymentMethod !== "bank_transfer") {
    return NextResponse.json(
      { error: "Bu ödeme yöntemi desteklenmiyor. Kartlı ödeme için iyzico akışını kullanın." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Kullanıcı + teslimat adresi: ÜYE ise kayıtlı adres; MİSAFİR ise girilen
  // bilgiden şifresiz üye oluşturulur (sipariş orphan olmaz).
  let userId: string;
  let address: any;
  if (authUser) {
    userId = authUser.id;
    if (!shippingAddressId) return NextResponse.json({ error: "Adres seçilmedi" }, { status: 400 });
    const { data: addr } = await supabase
      .from("user_addresses").select("*").eq("id", shippingAddressId).eq("user_id", userId).single();
    if (!addr) return NextResponse.json({ error: "Geçersiz adres" }, { status: 400 });
    address = addr;
  } else {
    const g = await resolveGuest(supabase, guest || {});
    if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.code });
    userId = g.userId;
    address = g.address;
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
    if (aff && aff.user_id !== userId) {
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
    // Kupon kuralları tek yerde (src/lib/coupon-rules.ts) — sepetteki doğrulamayla aynı
    const cr = await evaluateCoupon(supabase, { code: couponCode, userId, productTotal: pricing.productTotal });
    if (!cr.ok) {
      return NextResponse.json({ error: `Kupon uygulanamadı: ${cr.error}. Kuponu kaldırıp tekrar deneyin.` }, { status: 400 });
    }
    couponId = cr.coupon.id;
    validatedCoupon = cr.coupon;
    couponDiscount = cr.discount;
    freeShipping = cr.freeShipping;
  }

  // Toplam tutarı hesapla (doğrulanmış fiyatlardan)
  const productTotal = pricing.productTotal;
  const shipInfo = await resolveShipping(supabase, shippingMethodId, productTotal, freeShipping);
  const shippingCost = shipInfo.cost;
  const preTotal = Math.max(0, productTotal + shippingCost - couponDiscount); // kredi ÖNCESİ

  // YeriHisset Kredisi uygula (sunucuda doğrula + sınırla)
  const { applied: creditApplied, wallet: creditWallet } =
    await resolveCreditApply(supabase, userId, authUser ? Number(creditApply || 0) : 0, preTotal); // misafir (şifresiz hesaba bağlansa da) kredi harcayamaz
  const totalAmount = Math.max(0, Math.round((preTotal - creditApplied) * 100) / 100);
  const fullyCredited = totalAmount <= 0; // kredi tüm tutarı karşıladı

  // Adres bilgisi (JSON olarak sakla)
  const shippingAddressJson = JSON.stringify({
    name: `${address.first_name} ${address.last_name}`,
    phone: address.phone,
    address: address.address_detail,
    district: address.district,
    city: address.city,
  });

  // Fatura adresi snapshot'ı. Teslimatla aynıysa (veya seçim yoksa) teslimat
  // adresini kopyalarız; farklı bir adres seçildiyse onu doğrulayıp saklarız.
  const billingFrom = (a: any, same: boolean) => ({
    same_as_shipping: same,
    name: `${a.first_name} ${a.last_name}`,
    phone: a.phone,
    address: a.address_detail,
    district: a.district,
    city: a.city,
    is_corporate: !!a.is_corporate,
    company_name: a.is_corporate ? a.company_name : null,
    tax_office: a.is_corporate ? a.tax_office : null,
    tax_number: a.is_corporate ? a.tax_number : null,
  });
  let billingSnap: Record<string, unknown> = billingFrom(address, true);
  if (billingSameAsShipping === false && billingAddressId && billingAddressId !== shippingAddressId) {
    const { data: bAddr } = await supabase
      .from("user_addresses").select("*").eq("id", billingAddressId).eq("user_id", userId).single();
    if (bAddr) billingSnap = billingFrom(bAddr, false);
  }
  const billingAddressJson = JSON.stringify(billingSnap);

  // Ödeme yöntemine göre başlangıç durumları.
  // Kredi tüm tutarı karşıladıysa (fullyCredited) sipariş ÖDENMİŞ sayılır —
  // havale beklenmez.
  const initialStatus = fullyCredited ? "processing" : "awaiting_payment";
  const initialPaymentStatus  = fullyCredited ? "paid" : "pending";
  const initialShipmentStatus = fullyCredited ? "preparing" : "waiting";
  const initialInvoiceStatus  = "pending";

  // Siparişi oluştur
  const { data: order, error: orderError } = await (supabase
    .from("orders")
    .insert({
      user_id: userId,
      status: initialStatus,
      total_amount: Math.max(0, totalAmount),
      shipping_address: shippingAddressJson,
      billing_address: billingAddressJson,
      shipping_method: shipInfo.name,
      shipping_cost: shippingCost,
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

  // YeriHisset Kredisi düşümü (bakiye − , ledger 'spend', orders.credit_used)
  if (creditApplied > 0 && creditWallet) {
    await deductCreditForOrder(supabase, {
      userId: userId, orderId: order.id, applied: creditApplied, wallet: creditWallet,
    });
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
  kickMarketplaceSync(); // stok değişti → pazaryerlerine (Trendyol) gönder
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

  // NOT: Affiliate komisyonu artık sipariş anında YAZILMIYOR. Aylık hakediş
  // raporu (/api/admin/affiliate/payout), geçen ay tamamlanan + iade edilmemiş
  // siparişlerden hesaplar. Sipariş anında yazmak iade/değişim yüzünden yanlıştı.
  // (affiliate_id siparişte tutulmaya devam ediyor; rapor onu kullanır.)

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
      .eq("user_id", userId)
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
        user_id: userId,
        coupon_id: couponId,
        use_count: 1,
        last_used_at: now,
        last_order_id: order.id,
      });
    }
  }

  // Müşteri rolü + otomatik etiketler (kategori / marka / numara) artık VERİTABANINDA:
  // sipariş ÖDENİNCE tetikleyici atar (refresh_member_auto_tags, migration 20261015000001).
  // Ödenmemiş havale siparişi rol kazandırmaz; aktarılan/pazaryeri siparişlerinde de aynı kural.

  // Sipariş oluşturma bildirimi gönder (non-blocking, doğrudan lib çağrısı)
  const { sendOrderNotification, sendAdminNewOrderNotification, alertOutOfStockForOrder, sendGuestActivationEmail, reportCustomerEmailFailure } = await import("@/lib/notifications");
  // Misafirse hesap aktivasyonu (şifre belirleme) e-postası, sipariş e-postası
  // GİTTİKTEN SONRA gönderilir (önce sipariş/ödeme bilgisi, sonra şifre bağlantısı)
  const guestEmail = !authUser && guest?.email ? guest.email.trim().toLowerCase() : null;
  sendOrderNotification("order_placed", { orderId: order.id, userId: userId })
    .then((r) => {
      if (r?.channel === "email" && r.status === "failed") {
        return reportCustomerEmailFailure({ orderId: order.id, email: guestEmail ?? authUser?.email ?? null, kind: "sipariş onayı", reason: r.error });
      }
    })
    .catch(() => {})
    .then(() => {
      if (!guestEmail) return;
      return sendGuestActivationEmail({
        email: guestEmail,
        name: address?.first_name ?? null,
        orderLabel: (order as any).order_number ? `YH${(order as any).order_number}` : null,
      }).then((r) => {
        if (r.status !== "sent") {
          console.error("[guest-activation]", r.error);
          return reportCustomerEmailFailure({ orderId: order.id, email: guestEmail, kind: "hesap aktivasyonu", reason: r.error });
        }
      });
    })
    .catch((e) => console.error("[guest-activation]", e?.message || e));
  // Admin'e "yeni sipariş geldi" bildirimi (sonucu logla — teşhis için)
  sendAdminNewOrderNotification(order.id)
    .then((r) => { if (r.status !== "sent") console.error("[admin-order-mail]", JSON.stringify(r)); else console.log("[admin-order-mail] sent"); })
    .catch((e) => console.error("[admin-order-mail] exception", e?.message || e));
  // Satışla stoğu 0'a düşen ürün(ler) için admin'e "satış noktalarında kapat" uyarısı
  alertOutOfStockForOrder(order.id).catch((e) => console.error("[out-of-stock-alert]", e?.message || e));

  return NextResponse.json({
    orderId: order.id,
    orderNumber: (order as any).order_number ?? null,
    totalAmount: Number((order as any).total_amount ?? totalAmount),
    isGuest: !authUser,
  });
}
