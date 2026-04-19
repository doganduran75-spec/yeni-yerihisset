/**
 * GA4 e-ticaret event yardımcıları
 * Tüm fonksiyonlar sadece client-side (window.gtag mevcutsa) çalışır.
 */

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
}

// ─── Arama yapıldı ────────────────────────────────────────────────────────────
export function trackSearch(term: string) {
  gtag("event", "search", { search_term: term });
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
}
