/**
 * GA4 e-ticaret event yardımcıları
 * Tüm fonksiyonlar sadece client-side (window.gtag mevcutsa) çalışır.
 * Her biri aynı anda first-party analitiğe (src/lib/track.ts) de yazar.
 */
import { track } from "./track";

type GtagItem = {
  item_id: string;
  item_name: string;
  item_category?: string;
  item_brand?: string;
  item_variant?: string;
  price: number;
  quantity: number;
};

function gtag(command: string, ...args: unknown[]) {
  if (typeof window === "undefined" || !window.gtag) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window.gtag as any)(command, ...args);
}

// ─── Sayfa görüntüleme ────────────────────────────────────────────────────────
export function trackPageView(url: string, title?: string) {
  gtag("event", "page_view", { page_location: url, page_title: title });
}

// ─── Ürün sayfası açıldı ─────────────────────────────────────────────────────
export function trackViewItem(params: {
  productId: string;
  productName: string;
  category?: string;
  brand?: string;
  price: number;
  currency?: string;
}) {
  gtag("event", "view_item", {
    currency: params.currency ?? "TRY",
    value: params.price,
    items: [
      {
        item_id: params.productId,
        item_name: params.productName,
        item_category: params.category,
        item_brand: params.brand,
        price: params.price,
        quantity: 1,
      } satisfies GtagItem,
    ],
  });
  track("view_item", { product_id: params.productId, name: params.productName, category: params.category, brand: params.brand, price: params.price });
}

// ─── Sepete eklendi ───────────────────────────────────────────────────────────
export function trackAddToCart(params: {
  productId: string;
  productName: string;
  variantName?: string;
  category?: string;
  brand?: string;
  price: number;
  quantity: number;
  currency?: string;
}) {
  gtag("event", "add_to_cart", {
    currency: params.currency ?? "TRY",
    value: params.price * params.quantity,
    items: [
      {
        item_id: params.productId,
        item_name: params.productName,
        item_variant: params.variantName,
        item_category: params.category,
        item_brand: params.brand,
        price: params.price,
        quantity: params.quantity,
      } satisfies GtagItem,
    ],
  });
  track("add_to_cart", { product_id: params.productId, name: params.productName, variant: params.variantName, category: params.category, price: params.price, quantity: params.quantity });
}

// ─── Ödeme başlatıldı ─────────────────────────────────────────────────────────
export function trackBeginCheckout(params: {
  items: Array<{
    id: string;
    title: string;
    price: number;
    quantity: number;
    variant_name?: string;
  }>;
  total: number;
  couponCode?: string;
  currency?: string;
}) {
  gtag("event", "begin_checkout", {
    currency: params.currency ?? "TRY",
    value: params.total,
    coupon: params.couponCode,
    items: params.items.map((item) => ({
      item_id: item.id,
      item_name: item.title,
      item_variant: item.variant_name,
      price: item.price,
      quantity: item.quantity,
    })),
  });
  track("begin_checkout", { value: params.total, coupon: params.couponCode, item_count: params.items.length });
}

// ─── Satın alma tamamlandı ────────────────────────────────────────────────────
export function trackPurchase(params: {
  orderId: string;
  items: Array<{
    id: string;
    title: string;
    price: number;
    quantity: number;
    variant_name?: string;
  }>;
  total: number;
  shipping?: number;
  couponCode?: string;
  affiliateCode?: string;
  currency?: string;
}) {
  gtag("event", "purchase", {
    transaction_id: params.orderId,
    currency: params.currency ?? "TRY",
    value: params.total,
    shipping: params.shipping ?? 0,
    coupon: params.couponCode,
    affiliation: params.affiliateCode,
    items: params.items.map((item) => ({
      item_id: item.id,
      item_name: item.title,
      item_variant: item.variant_name,
      price: item.price,
      quantity: item.quantity,
    })),
  });
  track("purchase", { order_id: params.orderId, value: params.total, shipping: params.shipping, coupon: params.couponCode, affiliate: params.affiliateCode, item_count: params.items.length });
}

// ─── Sepetten kaldırıldı ──────────────────────────────────────────────────────
export function trackRemoveFromCart(params: {
  productId: string;
  productName: string;
  price: number;
  quantity: number;
}) {
  gtag("event", "remove_from_cart", {
    currency: "TRY",
    value: params.price * params.quantity,
    items: [
      {
        item_id: params.productId,
        item_name: params.productName,
        price: params.price,
        quantity: params.quantity,
      },
    ],
  });
  track("remove_from_cart", { product_id: params.productId, name: params.productName, price: params.price, quantity: params.quantity });
}

// ─── Arama yapıldı ────────────────────────────────────────────────────────────
export function trackSearch(term: string, resultsCount?: number) {
  gtag("event", "search", { search_term: term });
  track("search", { term, results_count: resultsCount });
}

// ─── Fırsat/partner link tıklandı ────────────────────────────────────────────
export function trackOpportunityClick(params: {
  opportunityId: string;
  partnerName: string;
  title: string;
}) {
  gtag("event", "select_promotion", {
    promotion_id: params.opportunityId,
    promotion_name: params.title,
    creative_name: params.partnerName,
  });
  track("opportunity_click", { opportunity_id: params.opportunityId, partner: params.partnerName, title: params.title });
}

// ─── Kupon kodu uygulandı / denendi (başarısız dahil — Instagram ölçümü) ──────
export function trackCouponApply(params: { code: string; success: boolean; reason?: string; discount?: number }) {
  track("coupon_apply", { code: params.code, success: params.success, reason: params.reason, discount: params.discount });
}
