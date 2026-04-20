import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CartProvider, useCart } from "@/contexts/CartContext";
import type { Product } from "@/types";

vi.mock("@/contexts/LocationContext", () => ({
  useLocation: () => ({ location: { pincode: "110001" } }),
}));

const mockCheck = vi.fn();
vi.mock("@/services/locationService", () => ({
  locationService: { checkServiceability: (...a: unknown[]) => mockCheck(...a) },
}));

vi.mock("@/services/analyticsService", () => ({
  analyticsService: { trackEvent: vi.fn().mockResolvedValue(undefined) },
}));

function makeProduct(id: string, price: number): Product {
  return {
    id, slug: id, title: `P-${id}`, description: "", price,
    images: [], category: "x", stock: 10, vendorId: "v1", storeName: "S",
    rating: 0, reviewCount: 0, isSponsored: false, status: "active",
    createdAt: new Date().toISOString(), salesCount: 0, viewCount: 0,
    trendingScore: 0, lowStockThreshold: 1, reservedStock: 0,
  } as unknown as Product;
}

function Probe({ onReady }: { onReady: (v: ReturnType<typeof useCart>) => void }) {
  const v = useCart();
  React.useEffect(() => { onReady(v); }, [v, onReady]);
  return null;
}

function wrap(children: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <CartProvider>{children}</CartProvider>
    </QueryClientProvider>
  );
}

describe("CartContext shipping math", () => {
  beforeEach(() => {
    localStorage.clear();
    mockCheck.mockReset();
  });

  it("computes shippingTotal from surcharge_pct and flags unserviceable + COD off", async () => {
    mockCheck.mockResolvedValue([
      { product_id: "p1", deliverable: true, eta_days: 3, surcharge_pct: 10, cod: false },
      { product_id: "p2", deliverable: false, eta_days: null, surcharge_pct: 0, cod: true },
    ]);

    const seen: ReturnType<typeof useCart>[] = [];
    render(wrap(<Probe onReady={(v) => seen.push(v)} />));

    act(() => {
      seen.at(-1)!.addToCart(makeProduct("p1", 100), 2); // 100*2 = 200
      seen.at(-1)!.addToCart(makeProduct("p2", 50), 1);  //  50
    });

    // wait for cart-serviceability query to resolve and recompute
    await waitFor(() => expect(seen.at(-1)?.serviceability.size).toBe(2));

    const v = seen.at(-1)!;
    expect(v.totalPrice).toBe(250);
    expect(v.shippingTotal).toBeCloseTo(20); // 200 * 0.10
    expect(v.grandTotal).toBeCloseTo(270);
    expect(v.hasUnserviceableItem).toBe(true);
    expect(v.codAvailable).toBe(false);
  });
});
