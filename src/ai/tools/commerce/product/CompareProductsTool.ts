import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";
import { supabase } from "../../../../integrations/supabase/client";
import { SearchProductsTool } from "./SearchProductsTool";

export interface CompareProductsInput {
  productIds?: string[];
  productNames?: string[];
  query?: string;
}

export interface ComparedProduct {
  id: string;
  title: string;
  category: string;
  price: number;
  discountPrice: number | null;
  rating: number;
  reviewCount: number;
  stock: number;
  artisan: string;
  material: string;
  dimensions: string;
  weight: string;
  origin: string;
  certifications: string[];
  features: string[];
  specifications: Record<string, string>;
}

export interface CompareProductsOutput {
  products: ComparedProduct[];
  recommendation: string;
}

export class CompareProductsTool extends BaseCommerceTool<CompareProductsInput, CompareProductsOutput> {
  readonly name = "compare_products";
  readonly description = "Compare 2-5 products side-by-side on structured attributes. Can accept product IDs, product names, or a general query.";
  
  readonly audiences = ["admin", "customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      productIds: {
        type: "array",
        items: { type: "string" },
        description: "Array of 2-5 product IDs to compare.",
      },
      productNames: {
        type: "array",
        items: { type: "string" },
        description: "Array of 2-5 product names to search and compare.",
      },
      query: {
        type: "string",
        description: "General query to search for products to compare (e.g., 'Compare saffron products').",
      }
    },
    required: [],
  };

  protected validate(input: CompareProductsInput): string | null {
    const hasIds = input.productIds && input.productIds.length > 0;
    const hasNames = input.productNames && input.productNames.length > 0;
    const hasQuery = !!input.query;

    if (!hasIds && !hasNames && !hasQuery) {
      return "Must provide productIds, productNames, or a query to compare.";
    }

    if (input.productIds && (input.productIds.length < 2 || input.productIds.length > 5)) {
      if (input.productIds.length === 1 && !hasNames && !hasQuery) {
        return "Must provide at least 2 products to compare.";
      }
    }

    if (input.productNames && (input.productNames.length < 2 || input.productNames.length > 5)) {
      if (input.productNames.length === 1 && !hasIds && !hasQuery) {
        return "Must provide at least 2 products to compare.";
      }
    }

    return null;
  }

  protected async run(
    input: CompareProductsInput,
    context: CommerceToolContext
  ): Promise<ToolResult<CompareProductsOutput>> {
    let idsToCompare: string[] = [];

    // 1. Gather IDs from input.productIds
    if (input.productIds) {
      idsToCompare.push(...input.productIds);
    }

    // 2. Resolve names to IDs using SearchProductsTool
    if (input.productNames && input.productNames.length > 0) {
      const searchTool = new SearchProductsTool();
      for (const name of input.productNames) {
        const searchRes = await searchTool.execute({ query: name }, context);
        if (searchRes.ok && searchRes.data.products.length > 0) {
          // Take the best match
          idsToCompare.push(searchRes.data.products[0].id);
        }
      }
    }

    // 3. Resolve general query to IDs if we still need more items
    if (input.query && idsToCompare.length < 2) {
      const searchTool = new SearchProductsTool();
      const searchRes = await searchTool.execute({ query: input.query }, context);
      if (searchRes.ok && searchRes.data.products.length > 0) {
        // Take up to 5 products from search
        const needed = 5 - idsToCompare.length;
        const newIds = searchRes.data.products.slice(0, needed).map((p: any) => p.id);
        idsToCompare.push(...newIds);
      }
    }

    // Deduplicate IDs
    idsToCompare = [...new Set(idsToCompare)];

    if (idsToCompare.length < 2) {
      return ok({
        products: [],
        recommendation: "Could not find enough products to compare based on your request. Please try different names or a broader query.",
      });
    }

    // Limit to 5
    idsToCompare = idsToCompare.slice(0, 5);

    try {
      const { data, error } = await supabase
        .from("products")
        .select(`
          *,
          vendor:vendors (
            id,
            store_name,
            business_name
          )
        `)
        .in("id", idsToCompare);

      if (error) {
        return err({ code: "execution_error", message: error.message });
      }

      if (!data || data.length === 0) {
        return ok({
          products: [],
          recommendation: "Could not retrieve the requested products.",
        });
      }

      const comparedProducts: ComparedProduct[] = data.map((p: any) => {
        return {
          id: p.id,
          title: p.title,
          category: p.category || "Uncategorized",
          price: p.price,
          discountPrice: p.discount_price || null,
          rating: p.rating || 0,
          reviewCount: p.review_count || 0,
          stock: p.stock || 0,
          artisan: p.vendor?.store_name || p.vendor?.business_name || "Unknown Artisan",
          material: p.materials ? (Array.isArray(p.materials) ? p.materials.join(", ") : p.materials) : "N/A",
          dimensions: p.dimensions ? `${p.dimensions.length}x${p.dimensions.width}x${p.dimensions.height}` : "N/A",
          weight: p.weight ? `${p.weight}g` : "N/A",
          origin: p.origin || "Kashmir",
          certifications: p.certifications || [],
          features: p.features || [],
          specifications: p.specifications || {},
        };
      });

      // Generate recommendation
      const recommendation = this.generateRecommendation(comparedProducts, input.query);

      return ok({
        products: comparedProducts,
        recommendation,
      });
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private generateRecommendation(products: ComparedProduct[], query?: string): string {
    if (products.length === 0) return "";

    // Simple heuristic-based recommendation
    let bestProduct = products[0];
    let highestScore = -1;

    const queryLower = (query || "").toLowerCase();

    for (const p of products) {
      let score = 0;
      
      // Value for money (lower price relative to average gets slight bump)
      const avgPrice = products.reduce((acc, curr) => acc + curr.price, 0) / products.length;
      if (p.price <= avgPrice) score += 5;
      
      // Discount
      if (p.discountPrice && p.discountPrice < p.price) score += 10;
      
      // Ratings
      if (p.rating >= 4.5) score += 15;
      else if (p.rating >= 4.0) score += 5;
      
      score += Math.min(p.reviewCount, 20); // Cap review count influence

      // Query matching
      if (queryLower) {
        if (p.title.toLowerCase().includes(queryLower)) score += 20;
        if (p.category.toLowerCase().includes(queryLower)) score += 10;
      }
      
      // Stock
      if (p.stock > 0) score += 5;

      if (score > highestScore) {
        highestScore = score;
        bestProduct = p;
      }
    }

    let recommendationText = `Based on the comparison, **${bestProduct.title}** stands out as the best recommendation`;
    
    const reasons: string[] = [];
    if (bestProduct.rating >= 4.5) reasons.push("its excellent customer ratings");
    if (bestProduct.discountPrice && bestProduct.discountPrice < bestProduct.price) reasons.push("its great value with the current discount");
    if (bestProduct.stock > 0) reasons.push("it is currently in stock and ready to ship");
    
    if (reasons.length > 0) {
      recommendationText += ` due to ${reasons.join(" and ")}.`;
    } else {
      recommendationText += ` because it offers a solid balance of features and value.`;
    }

    return recommendationText;
  }
}
