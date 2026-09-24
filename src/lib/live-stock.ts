/* eslint-disable @typescript-eslint/no-explicit-any */
// Canlı stok okuma (tarayıcıdan, önbelleksiz). Liste/ürün sayfaları ISR ile
// önbelleklendiği için sayfadaki stok birkaç dakika eski olabilir; pm2 cluster'da
// anlık revalidate de güvenilir değil (her instance kendi önbelleği). Bu yüzden
// kararın verildiği anlarda (sayfa açılışı, "sepete ekle") stok DB'den okunur.
import { supabase } from "@/lib/supabase";

// Ürünlerin varyant stokları + varyantsız ürün stokları (tek seferde, 100'lük parçalar)
export async function fetchLiveStocks(productIds: string[]): Promise<{
  variants: Map<string, number>;
  products: Map<string, number>;
}> {
  const variants = new Map<string, number>();
  const products = new Map<string, number>();
  const ids = [...new Set(productIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const [vRes, pRes] = await Promise.all([
      (supabase as any).from("product_variants").select("id, stock").in("product_id", chunk),
      (supabase as any).from("products").select("id, stock").in("id", chunk),
    ]);
    for (const v of vRes.data ?? []) variants.set(v.id, Number(v.stock ?? 0));
    for (const p of pRes.data ?? []) products.set(p.id, Number(p.stock ?? 0));
  }
  return { variants, products };
}

// Tek kalemin (varyant ya da varyantsız ürün) güncel stoğu; okunamazsa null
export async function fetchItemStock(productId: string, variantId?: string | null): Promise<number | null> {
  try {
    const { data } = variantId
      ? await (supabase as any).from("product_variants").select("stock").eq("id", variantId).maybeSingle()
      : await (supabase as any).from("products").select("stock").eq("id", productId).maybeSingle();
    return data ? Number(data.stock ?? 0) : null;
  } catch {
    return null; // ağ hatası → engelleme; sepet/checkout zaten doğrular
  }
}
