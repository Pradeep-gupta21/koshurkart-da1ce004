import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sidebarMenuService } from "./sidebarMenuService";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
    functions: { invoke: vi.fn() },
    from: vi.fn(),
  },
}));

const originalFetch = globalThis.fetch;

describe("sidebarMenuService.fetchMenu", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "anon-key");
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("returns tree + trending when both endpoints succeed", async () => {
    const tree = [{ id: "1", title: "Cat", children: [] }];
    const trending = [{ id: "p1", title: "Prod", slug: "p", image: null, price: 9, discount_price: null }];
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.includes("/menu")) {
        return new Response(JSON.stringify({ tree }), { status: 200 });
      }
      return new Response(JSON.stringify({ trending }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await sidebarMenuService.fetchMenu("shop");
    expect(result.tree).toEqual(tree);
    expect(result.trending).toEqual(trending);
  });

  it("throws when /menu returns non-OK", async () => {
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.includes("/menu")) {
        return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
      }
      return new Response(JSON.stringify({ trending: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    await expect(sidebarMenuService.fetchMenu("shop")).rejects.toThrow(/Menu request failed/);
  });

  it("returns empty trending when trending endpoint fails", async () => {
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.includes("/menu")) {
        return new Response(JSON.stringify({ tree: [] }), { status: 200 });
      }
      return new Response("err", { status: 500 });
    }) as unknown as typeof fetch;

    const result = await sidebarMenuService.fetchMenu("shop");
    expect(result.trending).toEqual([]);
  });
});
