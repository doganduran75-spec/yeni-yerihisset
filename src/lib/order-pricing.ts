/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Sunucu tarafı fiyat doğrulama.
 *
 * GÜVENLİK: Tarayıcıdan gelen `price` alanına ASLA güvenilmez. Sipariş tutarı
 * her zaman burada, veritabanındaki gerçek fiyatlardan yeniden hesaplanır.
 * Aksi halde bir kullanıcı isteği değiştirip 5.000₺'lik ürünü 1₺'ye alabilir.
 *
 * Ayrıca hediye (is_gift) öğeleri doğrulanır: yalnızca gerçekten geçerli bir
 * "bedelsiz ürün kuralı" varsa ve sepette o kuralı tetikleyen bir ürün varsa
 * hediye 0₺ olarak kabul edilir. Aksi halde sipariş reddedilir — böylece
 * "her şeyi is_gift=true yaparak bedava alma" açığı kapanır.
 */

import type { createAdminClient } from "@/lib/supabase-admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Tarayıcıdan gelen sepet öğesi. `price` yalnızca referanstır; para için kullanılmaz. */
export type IncomingItem = {
  product_id: string;
  variant_id?: string;
  variant_name?: string;
  title: string;
  price: number; // ← güvenilmez, yok sayılır
  quantity: number;
  is_gift?: boolean;
};

/** Fiyatı sunucuda doğrulanmış öğe. */
export type PricedItem = IncomingItem & {
  price: number; // ← veritabanından doğrulanmış birim fiyat
};

export type PricingResult =
  | { ok: true; items: PricedItem[]; productTotal: number }
  | { ok: false; error: string };

/**
 * Sepet öğelerinin fiyatlarını veritabanından doğrular ve ürün toplamını döner.
 *
 * @param supabase  service-role admin client
 * @param items     tarayıcıdan gelen sepet öğeleri
 */
export async function validateCartPricing(
  supabase: AdminClient,
  items: IncomingItem[]
): Promise<PricingResult> {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "Sepet boş." };
  }

  // Miktar doğrulaması (pozitif tamsayı)
  for (const it of items) {
    if (!it.product_id) return { ok: false, error: "Geçersiz ürün." };
    if (!Number.isInteger(it.quantity) || it.quantity < 1) {
      return { ok: false, error: "Geçersiz ürün adedi." };
    }
  }

  const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))];
  const variantIds = [...new Set(items.map((i) => i.variant_id).filter(Boolean) as string[])];

  // Ürün ve varyant fiyatlarını topluca çek
  // (supabase as any): üretilen tipler eski olabildiği için kod tabanı deseni
  const { data: products } = await (supabase as any)
    .from("products")
    .select("id, price, is_active, category_id")
    .in("id", productIds) as { data: any[] | null };

  type ProductRow = { id: string; price: number | string; is_active?: boolean | null; category_id?: string | null };
  const productMap = new Map<string, { price: number; is_active: boolean; category_id: string | null }>(
    ((products ?? []) as ProductRow[]).map((p) => [
      p.id,
      { price: Number(p.price), is_active: p.is_active !== false, category_id: p.category_id ?? null },
    ])
  );

  const variantMap = new Map<string, { price: number; is_active: boolean; product_id: string }>();
  if (variantIds.length > 0) {
    const { data: variants } = await (supabase as any)
      .from("product_variants")
      .select("id, price, is_active, product_id")
      .in("id", variantIds) as { data: any[] | null };

    (variants ?? []).forEach((v: any) => {
      variantMap.set(v.id, {
        price: Number(v.price),
        is_active: v.is_active !== false,
        product_id: v.product_id,
      });
    });
  }

  // ── Hediye doğrulaması için: aktif bedelsiz ürün kuralları ────────────────
  const giftProductIds = [
    ...new Set(items.filter((i) => i.is_gift).map((i) => i.product_id).filter(Boolean)),
  ];

  // Sepetteki hediye OLMAYAN ürünlerin kategorileri (kuralı tetikleyenler)
  const nonGiftCategoryIds = new Set<string>();
  for (const it of items) {
    if (it.is_gift) continue;
    const p = productMap.get(it.product_id);
    if (p?.category_id) nonGiftCategoryIds.add(p.category_id);
  }

  // gift_product_id → tetikleyici kategori(ler)
  const giftRuleCategories = new Map<string, Set<string>>();
  if (giftProductIds.length > 0) {
    const { data: rules } = await (supabase as any)
      .from("free_gift_rules")
      .select("gift_product_id, trigger_category_id, is_active")
      .in("gift_product_id", giftProductIds)
      .eq("is_active", true) as { data: any[] | null };

    (rules ?? []).forEach((r: any) => {
      if (!giftRuleCategories.has(r.gift_product_id)) {
        giftRuleCategories.set(r.gift_product_id, new Set());
      }
      giftRuleCategories.get(r.gift_product_id)!.add(r.trigger_category_id);
    });
  }

  // ── Her öğeyi doğrula ─────────────────────────────────────────────────────
  const priced: PricedItem[] = [];

  for (const it of items) {
    if (it.is_gift) {
      // Hediye: geçerli bir kural VE sepette tetikleyici ürün olmalı
      const ruleCats = giftRuleCategories.get(it.product_id);
      const claimable =
        !!ruleCats && [...ruleCats].some((cat) => nonGiftCategoryIds.has(cat));

      if (!claimable) {
        return {
          ok: false,
          error: "Geçersiz hediye ürünü. Lütfen sepeti yenileyip tekrar deneyin.",
        };
      }
      priced.push({ ...it, price: 0 });
      continue;
    }

    // Normal ürün: fiyat DB'den
    let realPrice: number | undefined;

    if (it.variant_id) {
      const v = variantMap.get(it.variant_id);
      if (!v || !v.is_active) {
        return { ok: false, error: `"${it.title}" artık mevcut değil.` };
      }
      // Varyantın gerçekten bu ürüne ait olduğunu doğrula
      if (v.product_id !== it.product_id) {
        return { ok: false, error: "Ürün/varyant uyuşmazlığı." };
      }
      realPrice = v.price;
    } else {
      const p = productMap.get(it.product_id);
      if (!p || !p.is_active) {
        return { ok: false, error: `"${it.title}" artık mevcut değil.` };
      }
      realPrice = p.price;
    }

    if (typeof realPrice !== "number" || !(realPrice >= 0)) {
      return { ok: false, error: `"${it.title}" için fiyat bulunamadı.` };
    }

    priced.push({ ...it, price: realPrice });
  }

  const productTotal = priced.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return { ok: true, items: priced, productTotal: Math.round(productTotal * 100) / 100 };
}
