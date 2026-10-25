/* eslint-disable @typescript-eslint/no-explicit-any */
// KUPON KURALLARI — TEK YER. Sepetteki doğrulama (/api/coupons/validate), havale siparişi
// (/api/orders/create) ve kart siparişi (/api/checkout/iyzico/initialize) aynı kuralı kullanır.
// (Eskiden sipariş tarafı alt limit, başlangıç tarihi ve kişiye özel kupon kontrolünü atlıyordu →
// doğrudan istekle başkasına ait kişiye özel kupon / alt limitin altında kupon kullanılabiliyordu.)
// İndirim hesabı ürün toplamı (kargo hariç) üzerinden.
//
// 2026-10-24 (kullanıcı kararları):
//   * KAPSAM: kupon yalnız seçili markalarda / kategorilerde geçerli olabilir (coupons.brand_ids / category_ids;
//     boş = hepsi). İndirim ve alt limit yalnız o ürünlerin tutarına bakar. Hediye ürünler hariç.
//   * BİRLEŞME: birden çok kupon birlikte kullanılır (aynı tür dahil). Yüzdeler ürün tutarı üzerinden AYRI AYRI
//     hesaplanır (indirim indirimin üstüne binmez); toplam indirim ürün toplamını geçemez.
//   * Kodlar tek alanda virgülle taşınır ("KOD1,KOD2") — sepet, ödeme ve sipariş uçları aynı alanı kullanır.
import type { createAdminClient } from "@/lib/supabase-admin";
import { rateLimited, rateExceeded } from "@/lib/rate-limit";

// Kod tahmini (kaba kuvvet) koruması: bir üye saatte 10'dan fazla OLMAYAN kod denerse kupon doğrulaması durur
// (sepet, havale siparişi, kart siparişi — hepsi bu kuraldan geçer). Kodlar zaten tahmin edilemez (src/lib/coupon-code.ts).
const MISS_MAX = 10, MISS_WINDOW = 3600_000;
type AdminClient = ReturnType<typeof createAdminClient>;

export type CouponLine = { product_id: string; quantity: number; price: number; is_gift?: boolean };

export type CouponResult =
  | { ok: true; coupon: any; discount: number; freeShipping: boolean }
  | { ok: false; error: string; status: number };

export type CouponsResult =
  | { ok: true; applied: { coupon: any; discount: number; freeShipping: boolean }[]; discount: number; freeShipping: boolean }
  | { ok: false; error: string; status: number; code?: string };

/** "KOD1, kod2 ,KOD1" → ["KOD1","KOD2"] */
export function parseCouponCodes(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split(",");
  return [...new Set(list.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean))].slice(0, 10);
}

/** Kuponun geçerli olduğu ürünlerin tutarı (kapsam yoksa bütün ürünler; hediye hariç) */
async function eligibleBase(supabase: AdminClient, coupon: any, productTotal: number, lines?: CouponLine[]) {
  const brands: string[] = coupon.brand_ids || [];
  const cats: string[] = coupon.category_ids || [];
  if ((!brands.length && !cats.length) || !lines?.length) return productTotal;
  const pids = [...new Set(lines.map((l) => l.product_id).filter(Boolean))];
  const { data } = await (supabase as any).from("products").select("id, brand_id, category_id").in("id", pids);
  const info = new Map(((data as any[]) || []).map((p) => [p.id, p]));
  let base = 0;
  for (const l of lines) {
    if (l.is_gift) continue;
    const p = info.get(l.product_id);
    if (!p) continue;
    if (brands.length && !brands.includes(p.brand_id)) continue;
    if (cats.length && !cats.includes(p.category_id)) continue;
    base += Number(l.price) * Number(l.quantity);
  }
  return Math.round(base * 100) / 100;
}

export async function evaluateCoupon(
  supabase: AdminClient,
  opts: { code: string; userId: string; productTotal: number; lines?: CouponLine[] },
): Promise<CouponResult> {
  const code = String(opts.code || "").trim().toUpperCase();
  if (!code) return { ok: false, error: "Kupon kodu gerekli", status: 400 };
  if (rateExceeded("coupon-miss", opts.userId, MISS_MAX)) return { ok: false, error: "Çok fazla geçersiz kupon denemesi — biraz sonra tekrar dene", status: 429 };

  const { data: coupon } = await (supabase as any)
    .from("coupons").select("*").eq("code", code).eq("is_active", true).maybeSingle();
  if (!coupon) {
    rateLimited("coupon-miss", opts.userId, MISS_MAX, MISS_WINDOW);
    return { ok: false, error: "Geçersiz veya pasif kupon kodu", status: 404 };
  }

  const now = new Date();
  if (coupon.expires_at && new Date(coupon.expires_at) < now) return { ok: false, error: "Bu kupon süresi dolmuş", status: 400 };
  if (coupon.starts_at && new Date(coupon.starts_at) > now) return { ok: false, error: "Bu kupon henüz aktif değil", status: 400 };
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    return { ok: false, error: "Bu kupon kullanım limitine ulaşmış", status: 400 };
  }

  // Kapsam: kupon yalnız belli marka / kategorilerde geçerliyse indirim ve alt limit o ürünlerin tutarına bakar
  const base = await eligibleBase(supabase, coupon, opts.productTotal, opts.lines);
  const scoped = (coupon.brand_ids?.length || coupon.category_ids?.length) && opts.lines?.length;
  if (scoped && base <= 0) return { ok: false, error: "Bu kupon sepetindeki ürünlerde geçerli değil", status: 400 };
  const minTotal = Number(coupon.min_order_amount || 0);
  if (base < minTotal) {
    return { ok: false, error: `Bu kupon için minimum ${scoped ? "geçerli ürün" : "sipariş"} tutarı ₺${minTotal.toLocaleString("tr-TR")}`, status: 400 };
  }

  const { data: uc } = await (supabase as any)
    .from("user_coupons").select("id, use_count, max_uses, expires_at")
    .eq("user_id", opts.userId).eq("coupon_id", coupon.id).maybeSingle();
  // CRM kampanyası: kişiye özel süre atandığı andan başlar (user_coupons.expires_at)
  if (uc?.expires_at && new Date(uc.expires_at) < now) return { ok: false, error: "Bu kuponun süresi dolmuş", status: 400 };
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
    discount = (base * Number(coupon.amount)) / 100;
    if (coupon.max_discount_amount !== null) discount = Math.min(discount, Number(coupon.max_discount_amount));
  } else if (coupon.type === "fixed") {
    discount = Math.min(Number(coupon.amount), base);
  } else if (coupon.type === "free_shipping") {
    freeShipping = true;
  }
  return { ok: true, coupon, discount: Math.round(discount * 100) / 100, freeShipping };
}

/** Birden çok kupon: her biri ayrı değerlendirilir, indirimler toplanır (ürün toplamını geçemez). İlk hatada durur. */
export async function evaluateCoupons(
  supabase: AdminClient,
  opts: { codes: string[]; userId: string; productTotal: number; lines?: CouponLine[] },
): Promise<CouponsResult> {
  const applied: { coupon: any; discount: number; freeShipping: boolean }[] = [];
  for (const code of parseCouponCodes(opts.codes)) {
    const r = await evaluateCoupon(supabase, { code, userId: opts.userId, productTotal: opts.productTotal, lines: opts.lines });
    if (!r.ok) return { ok: false, error: r.error, status: r.status, code };
    applied.push({ coupon: r.coupon, discount: r.discount, freeShipping: r.freeShipping });
  }
  // Toplam indirim ürün toplamını geçemez: fazlası sondaki kupondan kırpılır
  let total = applied.reduce((a, x) => a + x.discount, 0);
  for (let i = applied.length - 1; i >= 0 && total > opts.productTotal; i--) {
    const cut = Math.min(applied[i].discount, total - opts.productTotal);
    applied[i].discount = Math.round((applied[i].discount - cut) * 100) / 100;
    total -= cut;
  }
  return {
    ok: true, applied,
    discount: Math.round(applied.reduce((a, x) => a + x.discount, 0) * 100) / 100,
    freeShipping: applied.some((x) => x.freeShipping),
  };
}

/** Siparişin kuponlarını kaydet (order_coupons). count=true → kullanım hemen sayılır (havale). */
export async function saveOrderCoupons(
  supabase: AdminClient, orderId: string, applied: { coupon: any; discount: number; freeShipping: boolean }[],
) {
  if (!applied.length) return;
  await (supabase as any).from("order_coupons").upsert(applied.map((a) => ({
    order_id: orderId, coupon_id: a.coupon.id, discount: a.discount, free_shipping: a.freeShipping,
  })), { onConflict: "order_id,coupon_id" });
}

/** Kupon kullanımını say (toplam sayaç + kişi hakkı). Her kupon sipariş başına bir kez (counted). */
export async function countOrderCoupons(supabase: AdminClient, orderId: string, userId: string | null) {
  const s = supabase as any;
  const { data: rows } = await s.from("order_coupons").select("coupon_id").eq("order_id", orderId).eq("counted", false);
  const now = new Date().toISOString();
  for (const r of (rows as any[]) || []) {
    const { data: done } = await s.from("order_coupons").update({ counted: true })
      .eq("order_id", orderId).eq("coupon_id", r.coupon_id).eq("counted", false).select("coupon_id");
    if (!done?.length) continue; // başka bir istek saydı
    const { data: c } = await s.from("coupons").select("used_count").eq("id", r.coupon_id).maybeSingle();
    await s.from("coupons").update({ used_count: Number(c?.used_count || 0) + 1, updated_at: now }).eq("id", r.coupon_id);
    if (!userId) continue;
    const { data: uc } = await s.from("user_coupons").select("id, use_count").eq("user_id", userId).eq("coupon_id", r.coupon_id).maybeSingle();
    if (uc) await s.from("user_coupons").update({ use_count: Number(uc.use_count || 0) + 1, last_used_at: now, last_order_id: orderId }).eq("id", uc.id);
    else await s.from("user_coupons").insert({ user_id: userId, coupon_id: r.coupon_id, use_count: 1, last_used_at: now, last_order_id: orderId });
  }
}
