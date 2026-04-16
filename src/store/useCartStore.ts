import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  id: string; // This can be product_id or variant_id
  product_id: string;
  variant_id?: string;
  title: string;
  image: string;
  price: number;
  quantity: number;
  stock: number;
  variant_name?: string;
}

interface CartStore {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      
      addItem: (newItem) => {
        const { items } = get();
        const existingItem = items.find((item) => item.id === newItem.id);
        
        if (existingItem) {
          const updatedItems = items.map((item) =>
            item.id === newItem.id
              ? { ...item, quantity: Math.min(item.quantity + newItem.quantity, item.stock) }
              : item
          );
          set({ items: updatedItems });
        } else {
          set({ items: [...items, newItem] });
        }
      },
      
      removeItem: (id) => {
        set({ items: get().items.filter((item) => item.id !== id) });
      },
      
      updateQuantity: (id, quantity) => {
        const { items } = get();
        const updatedItems = items.map((item) =>
          item.id === id ? { ...item, quantity: Math.max(1, Math.min(quantity, item.stock)) } : item
        );
        set({ items: updatedItems });
      },
      
      clearCart: () => set({ items: [] }),
      
      getTotalItems: () => {
        return get().items.reduce((total, item) => total + item.quantity, 0);
      },
      
      getTotalPrice: () => {
        return get().items.reduce((total, item) => total + item.price * item.quantity, 0);
      },
    }),
    {
      name: 'shopping-cart',
    }
  )
);
