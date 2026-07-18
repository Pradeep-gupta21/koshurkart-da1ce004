import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { CartItem, Product } from "@/types";
import { toast } from "sonner";
import { analyticsService } from "@/services/analyticsService";
import { locationService } from "@/services/locationService";
import { useLocation } from "@/contexts/LocationContext";
import { useAuth } from "@/hooks/useAuth";
import { ServiceFactory } from "@/services/commerce/di/ServiceFactory";

const CART_STORAGE_KEY = "marketplace_cart";
const BUYNOW_STORAGE_KEY = "marketplace_buynow";

export interface CartServiceabilityRow {
  product_id: string;
  deliverable: boolean;
  eta_days: number | null;
  surcharge_pct: number;
  cod: boolean;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  startBuyNow: (product: Product, quantity?: number) => void;
  exitBuyNow: () => void;
  isBuyNow: boolean;
  totalItems: number;
  totalPrice: number;
  shippingTotal: number;
  grandTotal: number;
  hasUnserviceableItem: boolean;
  codAvailable: boolean;
  serviceability: Map<string, CartServiceabilityRow>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function loadPersistedCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function loadBuyNow(): CartItem[] | null {
  try {
    const raw = sessionStorage.getItem(BUYNOW_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const initialBuyNow = loadBuyNow();
  const [isBuyNow, setIsBuyNow] = useState<boolean>(initialBuyNow !== null);
  const [items, setItems] = useState<CartItem[]>(initialBuyNow ?? loadPersistedCart());
  const { location } = useLocation();
  const pincode = location?.pincode ?? null;

  useEffect(() => {
    let mounted = true;
    async function syncCart() {
      if (!user || isBuyNow) return;
      const cartService = ServiceFactory.getCartService();
      const productService = ServiceFactory.getProductService();

      const localItems = loadPersistedCart();

      // Migrate local items to DB if any
      for (const item of localItems) {
        await cartService.addToCart(user.id, item.product.id, item.quantity);
      }
      if (localItems.length > 0) {
        localStorage.removeItem(CART_STORAGE_KEY);
      }

      const res = await cartService.getCart(user.id);
      if (res.success && res.data?.order_items && mounted) {
        const orderItems = res.data.order_items;
        if (orderItems.length === 0) {
          setItems([]);
          return;
        }
        
        const productIds = orderItems.map((i: any) => i.product_id);
        const productsRes = await productService.getProductsByIds(productIds);
        
        if (productsRes.success && mounted) {
          const newItems = orderItems.map((i: any) => {
            const p = productsRes.data.find(p => p.id === i.product_id);
            return p ? { product: p, quantity: i.quantity } : null;
          }).filter(Boolean) as CartItem[];
          setItems(newItems);
        }
      }
    }
    syncCart();
    return () => { mounted = false; };
  }, [user, isBuyNow]);

  useEffect(() => {
    if (isBuyNow) {
      sessionStorage.setItem(BUYNOW_STORAGE_KEY, JSON.stringify(items));
    } else if (!user) {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    }
  }, [items, isBuyNow, user]);

  const addToCart = useCallback(async (product: Product, quantity = 1) => {
    setItems(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { product, quantity }];
    });
    toast.success("Added to cart", { description: `${product.title} has been added.` });
    analyticsService.trackEvent('add_to_cart', product.id).catch(() => {});

    if (user && !isBuyNow) {
      const res = await ServiceFactory.getCartService().addToCart(user.id, product.id, quantity);
      if (!res.success) {
        toast.error("Failed to sync cart", { description: res.error?.message });
      }
    }
  }, [user, isBuyNow]);

  const removeFromCart = useCallback(async (productId: string) => {
    setItems(prev => {
      const item = prev.find(i => i.product.id === productId);
      if (item) toast("Removed from cart", { description: `${item.product.title} was removed.` });
      return prev.filter(i => i.product.id !== productId);
    });

    if (user && !isBuyNow) {
      const res = await ServiceFactory.getCartService().removeFromCart(user.id, productId);
      if (!res.success) {
        toast.error("Failed to sync cart", { description: res.error?.message });
      }
    }
  }, [user, isBuyNow]);

  const updateQuantity = useCallback(async (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems(prev => prev.filter(i => i.product.id !== productId));
      if (user && !isBuyNow) {
        await ServiceFactory.getCartService().removeFromCart(user.id, productId);
      }
      return;
    }
    
    setItems(prev =>
      prev.map(item =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );

    if (user && !isBuyNow) {
      const res = await ServiceFactory.getCartService().updateQuantity(user.id, productId, quantity);
      if (!res.success) {
        toast.error("Failed to sync cart", { description: res.error?.message });
      }
    }
  }, [user, isBuyNow]);

  const clearCart = useCallback(async () => {
    if (isBuyNow) {
      sessionStorage.removeItem(BUYNOW_STORAGE_KEY);
      setIsBuyNow(false);
      setItems(loadPersistedCart());
      return;
    }
    
    setItems([]);
    if (!user) {
      localStorage.removeItem(CART_STORAGE_KEY);
    }
    toast("Cart cleared");

    if (user) {
      const res = await ServiceFactory.getCartService().clearCart(user.id);
      if (!res.success) {
        toast.error("Failed to sync cart", { description: res.error?.message });
      }
    }
  }, [isBuyNow, user]);

  const startBuyNow = useCallback((product: Product, quantity = 1) => {
    const next: CartItem[] = [{ product, quantity }];
    sessionStorage.setItem(BUYNOW_STORAGE_KEY, JSON.stringify(next));
    setIsBuyNow(true);
    setItems(next);
  }, []);

  const exitBuyNow = useCallback(() => {
    if (!sessionStorage.getItem(BUYNOW_STORAGE_KEY)) return;
    sessionStorage.removeItem(BUYNOW_STORAGE_KEY);
    setIsBuyNow(false);
    
    if (!user) {
      setItems(loadPersistedCart());
    }
  }, [user]);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce((sum, item) => {
    const price = item.product.discountPrice ?? item.product.price;
    return sum + price * item.quantity;
  }, 0);

  const productIds = items.map(i => i.product.id).sort();
  const serviceabilityKey = productIds.join(",");

  const { data: rows = [] } = useQuery({
    queryKey: ["cart-serviceability", pincode, serviceabilityKey],
    queryFn: () => locationService.checkServiceability(pincode!, productIds),
    enabled: !!pincode && productIds.length > 0,
    staleTime: 10 * 60_000,
  });

  const serviceability = new Map<string, CartServiceabilityRow>();
  for (const r of rows) serviceability.set(r.product_id, r);

  let shippingTotal = 0;
  let hasUnserviceableItem = false;
  let codAvailable = items.length > 0;
  for (const { product, quantity } of items) {
    if (product.allowCod === false) codAvailable = false;
    const row = serviceability.get(product.id);
    if (pincode && row) {
      if (!row.deliverable) hasUnserviceableItem = true;
      if (!row.cod) codAvailable = false;
      const price = product.discountPrice ?? product.price;
      shippingTotal += price * quantity * (Number(row.surcharge_pct) / 100);
    }
  }
  const grandTotal = totalPrice + shippingTotal;

  return (
    <CartContext.Provider value={{
      items, addToCart, removeFromCart, updateQuantity, clearCart,
      startBuyNow, exitBuyNow, isBuyNow,
      totalItems, totalPrice, shippingTotal, grandTotal,
      hasUnserviceableItem, codAvailable, serviceability,
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
};
