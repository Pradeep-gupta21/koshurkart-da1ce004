import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { CartItem, Product } from "@/types";
import { toast } from "sonner";
import { analyticsService } from "@/services/analyticsService";
import { locationService } from "@/services/locationService";
import { useLocation } from "@/contexts/LocationContext";

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
  const initialBuyNow = loadBuyNow();
  const [isBuyNow, setIsBuyNow] = useState<boolean>(initialBuyNow !== null);
  const [items, setItems] = useState<CartItem[]>(initialBuyNow ?? loadPersistedCart());
  const { location } = useLocation();
  const pincode = location?.pincode ?? null;

  useEffect(() => {
    if (isBuyNow) {
      sessionStorage.setItem(BUYNOW_STORAGE_KEY, JSON.stringify(items));
    } else {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    }
  }, [items, isBuyNow]);

  const addToCart = useCallback((product: Product, quantity = 1) => {
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
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setItems(prev => {
      const item = prev.find(i => i.product.id === productId);
      if (item) toast("Removed from cart", { description: `${item.product.title} was removed.` });
      return prev.filter(i => i.product.id !== productId);
    });
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems(prev => prev.filter(item => item.product.id !== productId));
      return;
    }
    setItems(prev =>
      prev.map(item =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  }, []);

  const clearCart = useCallback(() => {
    if (isBuyNow) {
      // End buy-now session and restore the previously saved persistent cart.
      sessionStorage.removeItem(BUYNOW_STORAGE_KEY);
      setIsBuyNow(false);
      setItems(loadPersistedCart());
      return;
    }
    setItems([]);
    localStorage.removeItem(CART_STORAGE_KEY);
    toast("Cart cleared");
  }, [isBuyNow]);

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
    setItems(loadPersistedCart());
  }, []);


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
