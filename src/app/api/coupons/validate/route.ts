/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth-from-request";
import { evaluateCoupon, parseCouponCodes, type CouponLine } from "@/lib/coupon-rules";

// Sepetteki kupon doğrulaması. Birden çok kod ("KOD1,KOD2" ya da codes[]) — her kupon ayrı sonuç döner
// (sepet hangisinin neden olmadığını gösterir); toplam indirim ürün toplamını geçemez. Kapsam (marka / kategori)
// için sepet satırları (items: product_id, quantity, price) gönderilir; fiyat yalnız görüntü içindir —
// sipariş anında sunucu fiyatıyla yeniden hesaplanır.
export async function POST(req: NextRequest) {
  // Oturum localStorage'da tutulduğundan Bearer token ile doğrulanır
  const user = await getAuthUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as any;
  const codes = parseCouponCodes(body.codes ?? body.code);
  if (!codes.length) return NextResponse.json({ error: "Kupon kodu gerekli" }, { status: 400 });
  const productTotal = Number(body.cartTotal) || 0;
  const lines: CouponLine[] = (Array.isArray(body.items) ? body.items : []).slice(0, 50).map((i: any) => ({
    product_id: String(i.product_id || ""), quantity: Number(i.quantity) || 0, price: Number(i.price) || 0, is_gift: !!i.is_gift,
  })).filter((l: CouponLine) => l.product_id && l.quantity > 0);

  const supabase = createAdminClient();
  const results: any[] = [];
  for (const code of codes) {
    const cr = await evaluateCoupon(supabase, { code, userId: user.id, productTotal, lines });
    results.push(cr.ok
      ? { code, ok: true, coupon_id: cr.coupon.id, name: cr.coupon.name, type: cr.coupon.type, amount: cr.coupon.amount, discount_amount: cr.discount, free_shipping: cr.freeShipping }
      : { code, ok: false, error: cr.error, status: cr.status });
  }
  const good = results.filter((r) => r.ok);
  let total = good.reduce((a, r) => a + r.discount_amount, 0);
  for (let i = good.length - 1; i >= 0 && total > productTotal; i--) {
    const cut = Math.min(good[i].discount_amount, total - productTotal);
    good[i].discount_amount = Math.round((good[i].discount_amount - cut) * 100) / 100;
    total -= cut;
  }
  if (!good.length) {
    const first = results[0];
    // Hiçbiri geçmedi → ilk kuponun hata kodu (olmayan 404, başkasına özel 403, diğerleri 400)
    return NextResponse.json({ error: first?.error || "Kupon uygulanamadı", results }, { status: first?.status || 400 });
  }
  return NextResponse.json({
    valid: true,
    results,
    // Tek kuponlu eski kullanım için alanlar (ödeme sayfası özeti)
    coupon_id: good[0].coupon_id,
    name: good.map((r) => r.name || r.code).join(" + "),
    type: good.length === 1 ? good[0].type : "multi",
    amount: good.length === 1 ? good[0].amount : null,
    discount_amount: Math.round(good.reduce((a, r) => a + r.discount_amount, 0) * 100) / 100,
    free_shipping: good.some((r) => r.free_shipping),
  });
}
