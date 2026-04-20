import { supabase } from "@/integrations/supabase/client";

export interface SidebarTrendingProduct {
  id: string;
  title: string;
  slug: string;
  image: string | null;
  price: number;
  discount_price: number | null;
}

export interface SidebarCategoryNode {
  id: string;
  label: string;
  slug: string;
  count: number;
  children?: SidebarCategoryNode[];
}

export interface SidebarProgram {
  id: string;
  label: string;
  to: string;
  icon: "tag" | "sparkles" | "trophy" | "flame";
}

export interface SidebarMenu {
  trending: SidebarTrendingProduct[];
  categories: SidebarCategoryNode[];
  programs: SidebarProgram[];
}

export const sidebarMenuService = {
  async fetchMenu(): Promise<SidebarMenu> {
    const { data, error } = await supabase.functions.invoke("get-sidebar-menu");
    if (error) throw error;
    return data as SidebarMenu;
  },
};
