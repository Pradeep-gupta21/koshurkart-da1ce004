import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { ERROR_CODES } from "../../../src/shared/errorCodes.ts";
import { PaymentError, respondWithError } from "../../../src/shared/errorResponse.ts";
import { ErrorCategory } from "../../../src/shared/statusCodeMap.ts";
import { normalizeRpcError } from "../../../src/shared/rpcErrorNormalizer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CategoryNode {
  id: string;
  label: string;
  slug: string;
  count: number;
  children?: CategoryNode[];
}

// Group flat category strings like "Electronics > Phones" into a 2-level tree.
function buildCategoryTree(rows: { category: string; count: number }[]): CategoryNode[] {
  const roots = new Map<string, CategoryNode>();

  for (const row of rows) {
    const parts = row.category.split(">").map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) continue;
    const [root, ...rest] = parts;

    if (!roots.has(root)) {
      roots.set(root, { id: root, label: root, slug: root, count: 0, children: [] });
    }
    const rootNode = roots.get(root)!;

    if (rest.length === 0) {
      rootNode.count += row.count;
    } else {
      const childLabel = rest.join(" > ");
      const fullSlug = parts.join(" > ");
      rootNode.children!.push({
        id: `${root}-${childLabel}`,
        label: childLabel,
        slug: fullSlug,
        count: row.count,
      });
      rootNode.count += row.count;
    }
  }

  return Array.from(roots.values())
    .sort((a, b) => b.count - a.count)
    .map((n) => ({
      ...n,
      children: n.children && n.children.length > 0
        ? n.children.sort((a, b) => b.count - a.count)
        : undefined,
    }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Trending: top sellers (last 7d window approximated via trending_score)
    const { data: trendingRows } = await supabase
      .from("products")
      .select("id, title, slug, images, price, discount_price")
      .eq("status", "active")
      .order("trending_score", { ascending: false })
      .order("sales_count", { ascending: false })
      .limit(6);

    const trending = (trendingRows ?? []).map((p: any) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      image: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null,
      price: Number(p.price ?? 0),
      discount_price: p.discount_price !== null ? Number(p.discount_price) : null,
    }));

    // Categories: aggregate
    const { data: catRows } = await supabase
      .from("products")
      .select("category")
      .eq("status", "active")
      .limit(1000);

    const counts = new Map<string, number>();
    for (const r of catRows ?? []) {
      const c = (r as any).category as string;
      if (!c) continue;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const categories = buildCategoryTree(
      Array.from(counts.entries()).map(([category, count]) => ({ category, count })),
    );

    const programs = [
      { id: "deals", label: "Today's Deals", to: "/search?sort=discount", icon: "tag" },
      { id: "new", label: "New Arrivals", to: "/search?sort=newest", icon: "sparkles" },
      { id: "best", label: "Best Sellers", to: "/search?sort=popularity", icon: "trophy" },
      { id: "trending", label: "Trending Now", to: "/search?sort=trending", icon: "flame" },
    ];

    return new Response(
      JSON.stringify({ trending, categories, programs }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300",
        },
      },
    );
  } catch (e) {
    console.error("get-sidebar-menu error:", e);
    return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, e instanceof Error ? e.message : "Unknown error", false), { ...corsHeaders, "Content-Type": "application/json" });
  }
});
