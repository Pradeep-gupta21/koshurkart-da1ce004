import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useServiceability } from "@/hooks/useServiceability";

vi.mock("@/contexts/LocationContext", () => ({
  useLocation: () => ({ location: { pincode: "110001" } }),
}));

const mockCheck = vi.fn();
vi.mock("@/services/locationService", () => ({
  locationService: { checkServiceability: (...a: unknown[]) => mockCheck(...a) },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useServiceability", () => {
  beforeEach(() => mockCheck.mockReset());

  it("returns a Map keyed by product_id", async () => {
    mockCheck.mockResolvedValue([
      { product_id: "p1", deliverable: true, eta_days: 3, surcharge_pct: 0, cod: true },
      { product_id: "p2", deliverable: false, eta_days: null, surcharge_pct: 0, cod: false },
    ]);
    const { result } = renderHook(() => useServiceability(["p1", "p2"]), { wrapper });
    await waitFor(() => expect(result.current.map.size).toBe(2));
    expect(result.current.map.get("p1")?.deliverable).toBe(true);
    expect(result.current.map.get("p2")?.deliverable).toBe(false);
    expect(result.current.pincode).toBe("110001");
  });

  it("does not call service when productIds is empty", async () => {
    const { result } = renderHook(() => useServiceability([]), { wrapper });
    await new Promise((r) => setTimeout(r, 10));
    expect(mockCheck).not.toHaveBeenCalled();
    expect(result.current.map.size).toBe(0);
  });
});
