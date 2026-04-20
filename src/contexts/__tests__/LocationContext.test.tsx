import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import React from "react";
import { LocationProvider, useLocation } from "@/contexts/LocationContext";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));

const mockDetect = vi.fn();
const mockReverse = vi.fn();
const mockLookup = vi.fn();
const mockList = vi.fn().mockResolvedValue([]);
vi.mock("@/services/locationService", () => ({
  locationService: {
    detect: (...a: unknown[]) => mockDetect(...a),
    reverseGeocode: (...a: unknown[]) => mockReverse(...a),
    lookup: (...a: unknown[]) => mockLookup(...a),
    listUserLocations: (...a: unknown[]) => mockList(...a),
    invalidateLocationCaches: vi.fn(),
  },
}));

function Probe({ onReady }: { onReady: (v: ReturnType<typeof useLocation>) => void }) {
  const v = useLocation();
  React.useEffect(() => { onReady(v); }, [v, onReady]);
  return null;
}

describe("LocationContext", () => {
  beforeEach(() => {
    localStorage.clear();
    mockDetect.mockReset();
    mockReverse.mockReset();
    mockLookup.mockReset();
    // Disable browser geolocation so detectAuto falls straight through to IP detect
    Object.defineProperty(global.navigator, "geolocation", { configurable: true, value: undefined });
  });

  it("loads saved location from localStorage on mount", async () => {
    localStorage.setItem("nexus_location", JSON.stringify({
      pincode: "560001", city: "Bengaluru", state: "KA", country: "IN", source: "manual",
    }));
    mockLookup.mockResolvedValue({ serviceable: true });
    const seen: ReturnType<typeof useLocation>[] = [];
    render(
      <LocationProvider>
        <Probe onReady={(v) => seen.push(v)} />
      </LocationProvider>,
    );
    await waitFor(() => expect(seen.at(-1)?.location?.pincode).toBe("560001"));
    expect(mockDetect).not.toHaveBeenCalled();
  });

  it("falls back to IP detect when no stored location and no GPS", async () => {
    mockDetect.mockResolvedValue({
      pincode: "110001", city: "Delhi", state: "DL", country: "IN", lat: null, lng: null, source: "ip",
    });
    mockLookup.mockResolvedValue({ serviceable: true });
    const seen: ReturnType<typeof useLocation>[] = [];
    render(
      <LocationProvider>
        <Probe onReady={(v) => seen.push(v)} />
      </LocationProvider>,
    );
    await waitFor(() => expect(seen.at(-1)?.location?.pincode).toBe("110001"));
    expect(mockDetect).toHaveBeenCalled();
  });
});
