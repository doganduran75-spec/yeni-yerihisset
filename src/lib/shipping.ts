/* eslint-disable @typescript-eslint/no-explicit-any */
// Kargo ücreti SUNUCUDA hesaplanır (istemciden gelen ücrete güvenilmez).
// Seçilen yöntemi (veya varsayılanı) bulur; kupon ücretsiz-kargo ya da free_over
// eşiği sağlanıyorsa ücreti 0'a çeker.
import type { createAdminClient } from "@/lib/supabase-admin";
type AdminClient = ReturnType<typeof createAdminClient>;

export async function resolveShipping(
  supabase: AdminClient,
  shippingMethodId: string | undefined | null,
  productTotal: number,
  freeShippingCoupon: boolean
): Promise<{ name: string; cost: number }> {
  let method: any = null;
  if (shippingMethodId) {
    const { data } = await (supabase as any)
      .from("shipping_methods").select("*").eq("id", shippingMethodId).eq("is_active", true).maybeSingle();
    method = data;
  }
  if (!method) {
    const { data } = await (supabase as any)
      .from("shipping_methods").select("*").eq("is_active", true).order("sort_order").limit(1).maybeSingle();
    method = data;
  }
  if (!method) return { name: "Kargo", cost: 0 };

  let cost = Number(method.fee || 0);
  if (freeShippingCoupon) cost = 0;
  else if (method.free_over != null && productTotal >= Number(method.free_over)) cost = 0;
  return { name: method.name, cost: Math.round(cost * 100) / 100 };
}
