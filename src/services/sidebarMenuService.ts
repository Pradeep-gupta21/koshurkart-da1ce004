import { supabase } from "@/integrations/supabase/client";

export type MenuRole = "user" | "vendor" | "admin";

export interface MenuNode {
  id: string;
  title: string;
  icon: string | null;
  route: string | null;
  parent_id: string | null;
  role_access: MenuRole[];
  order_index: number;
  is_active: boolean;
  section: "shop" | "dashboard";
  badge_key: string | null;
  children: MenuNode[];
}

export interface SidebarTrendingProduct {
  id: string;
  title: string;
  slug: string;
  image: string | null;
  price: number;
  discount_price: number | null;
}

export interface SidebarDeliveryBanner {
  city: string;
  state: string | null;
  message: string;
  badge_key: string;
}

export interface SidebarMenuMeta {
  delivery_banner?: SidebarDeliveryBanner;
  pincode?: string | null;
}

export interface SidebarMenu {
  tree: MenuNode[];
  trending: SidebarTrendingProduct[];
  meta: SidebarMenuMeta;
}

export interface MenuItemInput {
  title: string;
  icon?: string | null;
  route?: string | null;
  parent_id?: string | null;
  role_access?: MenuRole[];
  order_index?: number;
  is_active?: boolean;
  section?: "shop" | "dashboard";
  badge_key?: string | null;
}

/**
 * Always send user JWT (when present) so the edge function resolves the
 * caller's roles. Falls back to the publishable apikey for guests.
 */
async function authedFetch(path: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1${path}`, {
    ...init,
    headers,
  });
}

export const sidebarMenuService = {
  /** Public: load admin-managed tree + trending products. JWT-aware + location-aware. */
  async fetchMenu(
    section: "shop" | "dashboard" = "shop",
    pincode?: string | null,
  ): Promise<SidebarMenu> {
    const qs = new URLSearchParams({ section });
    if (pincode) qs.set("pincode", pincode);
    const [treeRes, trendingRes] = await Promise.all([
      authedFetch(`/menu?${qs.toString()}`),
      authedFetch(`/get-sidebar-menu`).catch(() => null),
    ]);

    let tree: MenuNode[] = [];
    let meta: SidebarMenuMeta = { pincode: pincode ?? null };
    if (treeRes.ok) {
      const j = await treeRes.json().catch(() => ({}));
      tree = (j.tree as MenuNode[]) ?? [];
      if (j.meta) meta = { ...meta, ...(j.meta as SidebarMenuMeta) };
    } else {
      throw new Error(`Menu request failed (${treeRes.status})`);
    }

    let trending: SidebarTrendingProduct[] = [];
    if (trendingRes && trendingRes.ok) {
      const j = await trendingRes.json().catch(() => ({}));
      trending = (j.trending as SidebarTrendingProduct[]) ?? [];
    }

    return { tree, trending, meta };
  },

  /** Admin: create. */
  async createItem(input: MenuItemInput): Promise<MenuNode> {
    const { data, error } = await supabase.functions.invoke("menu", {
      method: "POST",
      body: input,
    });
    if (error) throw error;
    return (data as { item: MenuNode }).item;
  },

  /** Admin: update. */
  async updateItem(id: string, patch: Partial<MenuItemInput>): Promise<MenuNode> {
    const r = await authedFetch(`/menu/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(typeof j.error === "string" ? j.error : "Update failed");
    return j.item as MenuNode;
  },

  /** Admin: soft-delete (cascades to descendants). */
  async deleteItem(id: string): Promise<void> {
    const r = await authedFetch(`/menu/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(typeof j.error === "string" ? j.error : "Delete failed");
    }
  },

  /** Admin: list ALL items (incl. inactive) for management UI. Reads DB directly via RLS. */
  async listAll(section: "shop" | "dashboard" = "shop"): Promise<MenuNode[]> {
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("section", section)
      .order("order_index", { ascending: true });
    if (error) throw error;
    const rows = (data ?? []) as unknown as MenuNode[];
    const map = new Map<string, MenuNode>();
    rows.forEach((r) => map.set(r.id, { ...r, children: [] }));
    const roots: MenuNode[] = [];
    map.forEach((node) => {
      if (node.parent_id && map.has(node.parent_id)) {
        map.get(node.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    const sortRec = (list: MenuNode[]) => {
      list.sort((a, b) => a.order_index - b.order_index);
      list.forEach((n) => sortRec(n.children));
    };
    sortRec(roots);
    return roots;
  },
};
