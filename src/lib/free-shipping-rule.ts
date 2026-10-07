/* eslint-disable @typescript-eslint/no-explicit-any */
// Ürün kartlarındaki "Ücretsiz Kargo" rozeti için kural — varsayılan (ilk aktif) kargo yöntemi.
// Ödemedeki gerçek hesap: src/lib/shipping.ts (resolveShipping). Rozet aynı ayardan beslenir;
// eskiden sabit "fiyat > 1000" yazıyordu, ayar değişince kartlar yanlış bilgi veriyordu.
import { createClient } from "@supabase/supabase-js";

/** 0 = her sipariş ücretsiz · sayı = bu tutar ve üstü ücretsiz · null = ücretsiz kargo yok */
export async function getFreeShippingOver(): Promise<number | null> {
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!) as any;
    const { data } = await sb.from("shipping_methods").select("fee, free_over")
      .eq("is_active", true).order("sort_order").limit(1).maybeSingle();
    if (!data) return null;
    if (Number(data.fee || 0) === 0) return 0;
    return data.free_over != null ? Number(data.free_over) : null;
  } catch {
    return null;
  }
}

export const qualifiesFreeShipping = (price: number, freeOver: number | null | undefined) =>
  freeOver != null && price >= freeOver;
