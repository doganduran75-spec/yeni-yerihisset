import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';

export interface CartItem {
  id: string;           // `var_{variantId}` veya `prod_{productId}`
  product_id: string;
  variant_id?: string;
  title: string;
  image: string;
  price: number;        // Hediyeler için 0
  quantity: number;
  stock: number;
  variant_name?: string;
  category_id?: string; // Kural eşleştirmesi + per_order cascade silme için

  // ── Hediye alanları (yalnızca is_gift=true olduğunda dolu) ──
  is_gift?: boolean;
  gift_rule_id?: string;
  selection_group?: string | null; // Karşılıklı dışlama grubu (aynı gruptan 1 hediye)
  original_price?: number;     // Üstü çizili gösterilecek orijinal fiyat
  trigger_item_id?: string;    // per_item: hangi sepet öğesi tetikledi
  trigger_category_id?: string;// per_order cascade silme için
}

export interface GiftVariant {
  id: string;
  value: string;
  stock: number;
}

export interface PendingGift {
  rule_id: string;
  quantity_mode: 'per_item' | 'per_order' | 'first_order';
  trigger_item_id?: string;       // per_item modda set edilir
  trigger_category_id: string;
  product_id: string;
  title: string;
  image: string;
  original_price: number;
  variants: GiftVariant[];         // Stokta olan varyantlar
  has_variants: boolean;
  selection_group?: string | null; // Aynı gruptaki hediyelerden yalnızca biri seçilebilir
}

interface CartStore {
  items: CartItem[];
  pendingGifts: PendingGift[];  // Varyant seçimi beklenen hediyeler (persist edilmez)
  dismissedRules: string[];     // Bu oturumda reddedilen kural ID'leri (persist edilmez)
  couponCode: string;           // Sepette seçilen/uygulanan kupon kodu (checkout'a taşınır)

  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  setCouponCode: (code: string) => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;

  // ── Hediye metodları ──
  checkGiftRules: (triggerCategoryId: string, triggerItemId: string, userId?: string) => Promise<void>;
  confirmGift: (ruleId: string, variant: GiftVariant | null) => void;
  dismissGift: (ruleId: string) => void;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      pendingGifts: [],
      dismissedRules: [],
      couponCode: '',

      setCouponCode: (code) => set({ couponCode: code }),

      // ── Sepete ürün ekle ──
      addItem: (newItem) => {
        const { items } = get();
        const existingItem = items.find((item) => item.id === newItem.id);

        if (existingItem) {
          set({
            items: items.map((item) => {
              if (item.id !== newItem.id) return item;
              const maxQty = item.stock > 0 ? item.stock : 9999;
              return { ...item, quantity: Math.min(item.quantity + newItem.quantity, maxQty) };
            }),
          });
        } else {
          set({ items: [...items, newItem] });
        }
      },

      // ── Sepetten öğe çıkar (hediyeleri cascade sil) ──
      removeItem: (id) => {
        const { items, pendingGifts } = get();
        const removedItem = items.find((i) => i.id === id);

        // Silinecek öğelerini belirle
        let newItems = items.filter((i) => i.id !== id);

        if (removedItem && !removedItem.is_gift) {
          // 1) Bu öğeye bağlı per_item hediyeleri sil
          newItems = newItems.filter(
            (i) => !(i.is_gift && i.trigger_item_id === id)
          );

          // 2) Aynı kategoride başka ürün kalmadıysa per_order hediyelerini de sil
          const catId = removedItem.category_id;
          if (catId) {
            const stillHasCategory = newItems.some(
              (i) => !i.is_gift && i.category_id === catId
            );
            if (!stillHasCategory) {
              newItems = newItems.filter(
                (i) => !(i.is_gift && !i.trigger_item_id && i.trigger_category_id === catId)
              );
            }
          }
        }

        // 3) İlgili pendingGift'leri de temizle
        let newPending = pendingGifts;
        if (removedItem && !removedItem.is_gift) {
          newPending = pendingGifts.filter((p) => {
            if (p.quantity_mode === 'per_item' && p.trigger_item_id === id) return false;
            if (
              (p.quantity_mode === 'per_order' || p.quantity_mode === 'first_order') &&
              p.trigger_category_id === removedItem.category_id
            ) {
              // Aynı kategoride başka ürün kaldı mı?
              const remaining = newItems.filter(
                (i) => !i.is_gift && i.category_id === removedItem.category_id
              );
              return remaining.length > 0;
            }
            return true;
          });
        }

        set({ items: newItems, pendingGifts: newPending });
      },

      updateQuantity: (id, quantity) => {
        set({
          items: get().items.map((item) => {
            if (item.id !== id) return item;
            // stock null/undefined/0 ise (varyant stoğu DB'de NULL olabilir)
            // üst sınır olarak 9999 kullan — sepete zaten eklenmiş, stok > 0 kabul edilir
            const maxQty = item.stock > 0 ? item.stock : 9999;
            return { ...item, quantity: Math.max(1, Math.min(quantity, maxQty)) };
          }),
        });
      },

      clearCart: () => set({ items: [], pendingGifts: [], dismissedRules: [], couponCode: '' }),

      getTotalItems: () =>
        get().items.reduce((total, item) => total + item.quantity, 0),

      // Hediyeler fiyata dahil edilmez (is_gift=true → price=0 zaten ama garantilemek için)
      getTotalPrice: () =>
        get().items.reduce(
          (total, item) => total + (item.is_gift ? 0 : item.price * item.quantity),
          0
        ),

      // ── Hediye kurallarını kontrol et ──
      checkGiftRules: async (triggerCategoryId, triggerItemId, userId?) => {
        const { items, pendingGifts, dismissedRules } = get();

        // Aktif kuralları çek
        // gift_product:products!gift_product_id → FK ile products tablosunu join et, alias "gift_product"
        const { data: rules } = await (supabase as any)
          .from('free_gift_rules')
          .select(`
            id, quantity_mode, selection_group,
            gift_product:products!gift_product_id (
              id, title, image_url, price, has_variants, stock,
              product_variants ( id, stock, variant_options ( value ) )
            )
          `)
          .eq('trigger_category_id', triggerCategoryId)
          .eq('is_active', true) as { data: any[] | null };

        if (!rules?.length) return;

        const newPending: PendingGift[] = [];

        for (const rule of rules) {
          // Bu oturumda reddedildiyse atla
          if (dismissedRules.includes(rule.id)) continue;

          const giftProduct = rule.gift_product;
          if (!giftProduct) continue;

          // per_order / first_order: zaten sepette var mı?
          if (rule.quantity_mode !== 'per_item') {
            const alreadyInCart = items.some(
              (i) => i.is_gift && i.gift_rule_id === rule.id
            );
            if (alreadyInCart) continue;

            // Zaten pending'de var mı?
            const alreadyPending = pendingGifts.some((p) => p.rule_id === rule.id);
            if (alreadyPending) continue;
          }

          // per_item: bu tetikleyiciye ait zaten pending/cart'ta var mı?
          if (rule.quantity_mode === 'per_item') {
            const alreadyInCart = items.some(
              (i) => i.is_gift && i.gift_rule_id === rule.id && i.trigger_item_id === triggerItemId
            );
            if (alreadyInCart) continue;

            const alreadyPending = pendingGifts.some(
              (p) => p.rule_id === rule.id && p.trigger_item_id === triggerItemId
            );
            if (alreadyPending) continue;
          }

          // first_order: kullanıcının daha önce siparişi var mı?
          if (rule.quantity_mode === 'first_order') {
            if (!userId) continue;
            const { count } = await supabase
              .from('orders')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', userId);
            if ((count ?? 0) > 0) continue;
          }

          // Varyantları hazırla
          let variants: GiftVariant[] = [];
          const hasVariants = !!giftProduct.has_variants;

          if (hasVariants && giftProduct.product_variants?.length) {
            variants = (giftProduct.product_variants as any[])
              .filter((v: any) => (v.stock ?? 0) > 0)
              .map((v: any) => ({
                id: v.id,
                value: v.variant_options?.value ?? '—',
                stock: v.stock,
              }));
            if (variants.length === 0) continue; // Tüm varyantlar tükendi
          } else {
            // Varyant yok — stok kontrolü
            if ((giftProduct.stock ?? 0) === 0) continue;
          }

          newPending.push({
            rule_id: rule.id,
            quantity_mode: rule.quantity_mode,
            trigger_item_id: rule.quantity_mode === 'per_item' ? triggerItemId : undefined,
            trigger_category_id: triggerCategoryId,
            product_id: giftProduct.id,
            title: giftProduct.title,
            image: giftProduct.image_url || '',
            original_price: giftProduct.price,
            variants,
            has_variants: hasVariants,
            selection_group: rule.selection_group ?? null,
          });
        }

        if (newPending.length > 0) {
          set((state) => ({ pendingGifts: [...state.pendingGifts, ...newPending] }));
        }
      },

      // ── Hediyeyi onayla (varyant seçildikten sonra) ──
      confirmGift: (ruleId, variant) => {
        const { pendingGifts } = get();
        const pending = pendingGifts.find((p) => p.rule_id === ruleId);
        if (!pending) return;

        // Varyant gerektiriyor ama seçilmedi
        if (pending.has_variants && !variant) return;

        const giftItem: CartItem = {
          id: variant
            ? `gift_var_${pending.rule_id}_${variant.id}`
            : `gift_prod_${pending.rule_id}_${pending.product_id}`,
          product_id: pending.product_id,
          variant_id: variant?.id,
          title: pending.title,
          image: pending.image,
          price: 0,
          quantity: 1,
          stock: variant?.stock ?? 1,
          variant_name: variant?.value,
          category_id: undefined,
          is_gift: true,
          gift_rule_id: ruleId,
          selection_group: pending.selection_group ?? null,
          original_price: pending.original_price,
          trigger_item_id: pending.trigger_item_id,
          trigger_category_id: pending.trigger_category_id,
        };

        set((state) => {
          // Karşılıklı dışlama: aynı seçim grubundaki diğer hediyeleri sepetten çıkar
          const grp = pending.selection_group;
          const base = grp
            ? state.items.filter((i) => !(i.is_gift && i.selection_group === grp))
            : state.items;

          // Aynı hediye zaten sepette varsa tekrar ekleme
          const already = base.some((i) => i.id === giftItem.id);
          return {
            items: already ? base : [...base, giftItem],
            pendingGifts: state.pendingGifts.filter((p) => p.rule_id !== ruleId),
          };
        });
      },

      // ── Hediyeyi reddet ──
      dismissGift: (ruleId) => {
        set((state) => ({
          pendingGifts: state.pendingGifts.filter((p) => p.rule_id !== ruleId),
          dismissedRules: [...state.dismissedRules, ruleId],
        }));
      },
    }),
    {
      name: 'shopping-cart',
      // Yalnızca items persist edilir; pendingGifts ve dismissedRules oturum bazlıdır
      partialize: (state) => ({ items: state.items, couponCode: state.couponCode }),
      // Merge: localStorage'dan sadece items alınır, geri kalanlar her zaman
      // başlangıç değeriyle başlar. Eski kayıtlarda eksik alan olsa da güvenli.
      merge: (persisted, current) => ({
        ...current,
        items: (persisted as any)?.items ?? [],
        couponCode: (persisted as any)?.couponCode ?? '',
        pendingGifts: [],
        dismissedRules: [],
      }),
    }
  )
);
