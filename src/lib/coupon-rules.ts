/* eslint-disable @typescript-eslint/no-explicit-any */
// KUPON KURALLARI — TEK YER. Sepetteki doğrulama (/api/coupons/validate), havale siparişi
// (/api/orders/create) ve kart siparişi (/api/checkout/iyzico/initialize) aynı kuralı kullanır.
// (Eskiden sipariş tarafı alt limit, başlangıç tarihi ve kişiye özel kupon kontrolünü atlıyordu →
// doğrudan istekle başkasına ait kişiye özel kupon / alt limitin altında kupon kullanılabiliyordu.)
// İndirim hesabı ürün toplamı (kargo hariç) üzerinden.
import type { createAdminClient } from "@/lib/supabase-admin";
type AdminClient = ReturnType<typeof createAdminClient>;

export type CouponResult =
  | { ok: true; coupon: any; discount: number; freeShipping: boolean }
  | { ok: false; error: string; status: number };

export async function evaluateCoupon(
  supabase: AdminClient,
  opts: { code: string; userId: string; productTotal: number },
): Promise<CouponResult> {
  const code = String(opts.code || "").trim().toUpperCase();
  if (!code) return { ok: false, error: "Kupon kodu gerekli", status: 400 };

  const { data: coupon } = await (supabase as any)
    .from("coupons").select("*").eq("code", code).eq("is_active", true).maybeSingle();
  if (!coupon) return { ok: false, error: "Geçersiz veya pasif kupon kodu", status: 404 };

  const now = new Date();
  if (coupon.expires_at && new Date(coupon.expires_at) < now) return { ok: false, error: "Bu kupon süresi dolmuş", status: 400 };
  if (coupon.starts_at && new Date(coupon.starts_at) > now) return { ok: false, error: "Bu kupon henüz aktif değil", status: 400 };
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    return { ok: false, error: "Bu kupon kullanım limitine ulaşmış", status: 400 };
  }
  const minTotal = Number(coupon.min_order_amount || 0);
  if (opts.productTotal < minTotal) {
    return { ok: false, error: `Bu kupon için minimum sipariş tutarı ₺${minTotal.toLocaleString("tr-TR")}`, status: 400 };
  }

  const { data: uc } = await (supabase as any)
    .from("user_coupons").select("id, use_count, max_uses")
    .eq("user_id", opts.userId).eq("coupon_id", coupon.id).maybeSingle();
  // Kişiye tanınan hak (max_uses) varsa onu, yoksa kuponun kişi başı limitini kullan
  const limit = uc?.max_uses ?? coupon.per_user_limit;
  if (coupon.is_personal) {
    if (!uc) return { ok: false, error: "Bu kupon size özel değil veya atanmamış", status: 403 };
    if (uc.use_count >= limit) return { ok: false, error: "Bu kuponu zaten kullandınız", status: 400 };
  } else if (uc && uc.use_count >= limit) {
    return { ok: false, error: "Bu kuponu daha önce kullandınız", status: 400 };
  }

  let discount = 0;
  let freeShipping = false;
  if (coupon.type === "percentage") {
    discount = (opts.productTotal * Number(coupon.amount)) / 100;
    if (coupon.max_discount_amount !== null) discount = Math.min(discount, Number(coupon.max_discount_amount));
  } else if (coupon.type === "fixed") {
    discount = Math.min(Number(coupon.amount), opts.productTotal);
  } else if (coupon.type === "free_shipping") {
    freeShipping = true;
  }
  return { ok: true, coupon, discount: Math.round(discount * 100) / 100, freeShipping };
}
