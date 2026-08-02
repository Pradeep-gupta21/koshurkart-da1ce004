import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";
import { supabase } from "../../../../integrations/supabase/client";

export type SearchProductsInput = {
  query?: string;
  category?: string;
  keywords?: string[];
  minPrice?: number;
  maxPrice?: number;
  featured?: boolean;
};

export interface SearchProductsOutput {
  products: any[];
  message: string;
}

export class SearchProductsTool extends BaseCommerceTool<SearchProductsInput, SearchProductsOutput> {
  readonly name = "search_products";
  readonly description = "Search for products in the catalog based on natural language queries, categories, keywords, price ranges, and featured status. Use this tool whenever a customer asks to find or show products.";
  
  readonly audiences = ["admin", "customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Natural language search query to match against title or description",
      },
      category: {
        type: "string",
        description: "Product category (e.g., 'Pashmina', 'Saffron', 'Carpets')",
      },
      keywords: {
        type: "array",
        items: { type: "string" },
        description: "Keywords to match in product title or description",
      },
      minPrice: {
        type: "number",
        description: "Minimum price in INR",
      },
      maxPrice: {
        type: "number",
        description: "Maximum price in INR",
      },
      featured: {
        type: "boolean",
        description: "Filter to only show featured/premium products",
      },
    },
    required: [],
  };

  protected validate(input: SearchProductsInput): string | null {
    if (input.minPrice !== undefined && input.minPrice < 0) return "minPrice cannot be negative.";
    if (input.maxPrice !== undefined && input.maxPrice < 0) return "maxPrice cannot be negative.";
    if (input.minPrice !== undefined && input.maxPrice !== undefined && input.minPrice > input.maxPrice) {
      return "minPrice cannot be greater than maxPrice.";
    }
    return null;
  }

  protected async run(
    input: SearchProductsInput,
    _context: CommerceToolContext
  ): Promise<ToolResult<SearchProductsOutput>> {
    try {
      let queryBuilder = supabase.from("products").select("id, title, price, category, description, is_sponsored, trending_score");

      queryBuilder = queryBuilder.eq("status", "active");

      if (input.query) {
        queryBuilder = queryBuilder.or(`title.ilike.%${input.query}%,description.ilike.%${input.query}%`);
      }

      if (input.category) {
        queryBuilder = queryBuilder.ilike("category", `%${input.category}%`);
      }

      if (input.keywords && input.keywords.length > 0) {
        const kwConditions = input.keywords.map(kw => `title.ilike.%${kw}%,description.ilike.%${kw}%`).join(',');
        queryBuilder = queryBuilder.or(kwConditions);
      }

      if (input.minPrice !== undefined) {
        queryBuilder = queryBuilder.gte("price", input.minPrice);
      }

      if (input.maxPrice !== undefined) {
        queryBuilder = queryBuilder.lte("price", input.maxPrice);
      }

      if (input.featured) {
        queryBuilder = queryBuilder.or(`is_sponsored.eq.true,trending_score.gte.50`);
      }

      queryBuilder = queryBuilder.limit(10);

      const { data, error } = await queryBuilder;

      if (error) {
        return err({
          code: "execution_error",
          message: error.message,
        });
      }

      const products = data ?? [];
      const message = products.length === 0
        ? "I couldn't find any products matching your request."
        : `I found ${products.length} products matching your request.`;

      return ok({ products, message });
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
