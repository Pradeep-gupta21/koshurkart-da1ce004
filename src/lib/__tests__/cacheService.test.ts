import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { cacheService } from "@/services/cacheService";

describe("cacheService", () => {
  beforeEach(() => {
    cacheService.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores and retrieves values", () => {
    cacheService.set("a", { x: 1 }, 60);
    expect(cacheService.get<{ x: number }>("a")).toEqual({ x: 1 });
  });

  it("returns null after TTL expires", () => {
    cacheService.set("b", "hello", 1);
    expect(cacheService.get("b")).toBe("hello");
    vi.advanceTimersByTime(2000);
    expect(cacheService.get("b")).toBeNull();
  });

  it("invalidatePattern removes keys with matching prefix only", () => {
    cacheService.set("loc:lookup:110001", 1, 60);
    cacheService.set("loc:lookup:560001", 2, 60);
    cacheService.set("serviceability:foo", 3, 60);
    cacheService.invalidatePattern("loc:lookup:");
    expect(cacheService.get("loc:lookup:110001")).toBeNull();
    expect(cacheService.get("loc:lookup:560001")).toBeNull();
    expect(cacheService.get("serviceability:foo")).toBe(3);
  });

  it("clear empties the store", () => {
    cacheService.set("k", 1, 60);
    cacheService.clear();
    expect(cacheService.size).toBe(0);
  });
});
