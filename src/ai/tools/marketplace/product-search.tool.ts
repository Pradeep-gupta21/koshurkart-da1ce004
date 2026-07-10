/**
 * KoshurKart — ProductSearchTool
 * =================================================================
 * Searches the product catalogue by keyword, category, price range,
 * or rating. Delegates to `searchService.searchProducts()` for
 * full-text queries, `productService.getAll()` for filter-only
 * browsing, and `productService.getTrending()` as a zero-criteria
 * fallback.
 *
 * Audience: unrestricted (customer, vendor, admin).
 */

import type { JSONSchema } from "@/ai/types/chat";
import type { ToolContext, ToolResult } from "../types";
import { ok, err } from "../types";
import { BaseTool } from "../base.tool";
import type { MarketplaceServices, ProductSummary } from "./types";
import { toProductSummary, clamp } from "./types";

/* ------------------------------------------------------------------ *
 * Input / Output
 * ------------------------------------------------------------------ */

export interface ProductSearchInput {
  query?: string;
  category?: string;
  priceMin?: number;
  priceMax?: number;
  minRating?: number;
  sort?: "relevance" | "price-low" | "price-high" | "rating" | "popularity" | "newest";
  limit?: number;
}

export interface ProductSearchOutput {
  products: ProductSummary[];
  totalCount: number;
}

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;

/* ------------------------------------------------------------------ *
 * Tool
 * ------------------------------------------------------------------ */

export class ProductSearchTool extends BaseTool<
  ProductSearchInput,
  ProductSearchOutput,
  MarketplaceServices
> {
  readonly name = "search_products";

  readonly description =
    "Search the product catalogue by keyword, category, price range, or rating. " +
    "Returns a ranked list of matching products with prices, ratings, and stock status. " +
    "When no search criteria are provided, returns trending products.";

  readonly parameters: JSONSchema = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Free-text search query (e.g. 'pashmina shawl', 'walnut wood box')",
      },
      category: {
        type: "string",
        description: "Exact category slug to filter by (e.g. 'pashmina', 'saffron', 'dry-fruits')",
      },
      priceMin: {
        type: "number",
        description: "Minimum price in INR (inclusive)",
      },
      priceMax: {
        type: "number",
        description: "Maximum price in INR (inclusive)",
      },
      minRating: {
        type: "number",
        description: "Minimum star rating, 1 to 5 (inclusive)",
      },
      sort: {
        type: "string",
        description: "Sort order for results",
        enum: ["relevance", "price-low", "price-high", "rating", "popularity", "newest"],
      },
      limit: {
        type: "number",
        description: `Maximum number of results to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`,
      },
    },
  };

  /* ---- Validation ------------------------------------------------ */

  protected validate(input: ProductSearchInput): string | null {
    if (input.minRating !== undefined) {
      if (!Number.isFinite(input.minRating) || input.minRating < 1 || input.minRating > 5) {
        return "minRating must be a number between 1 and 5.";
      }
    }
    if (input.priceMin !== undefined && (!Number.isFinite(input.priceMin) || input.priceMin < 0)) {
      return "priceMin must be a non-negative number.";
    }
    if (input.priceMax !== undefined && (!Number.isFinite(input.priceMax) || input.priceMax < 0)) {
      return "priceMax must be a non-negative number.";
    }
    if (
      input.priceMin !== undefined &&
      input.priceMax !== undefined &&
      input.priceMin > input.priceMax
    ) {
      return "priceMin must not exceed priceMax.";
    }
    return null;
  }

  /* ---- Execution ------------------------------------------------- */

  protected async run(
    input: ProductSearchInput,
    context: ToolContext<MarketplaceServices>,
  ): Promise<ToolResult<ProductSearchOutput>> {
    const services = context.services;
    if (!services) {
      return err("Marketplace services not available.", "unavailable");
    }

    const limit = clamp(input.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
    const sort = input.sort ?? "relevance";

    let products;

    if (input.query) {
      // Full-text search via the search RPC.
      products = await services.searchService.searchProducts(
        input.query,
        {
          category: input.category,
          priceMin: input.priceMin,
          priceMax: input.priceMax,
          minRating: input.minRating,
        },
        sort,
        limit,
      );
    } else if (
      input.category ||
      input.priceMin !== undefined ||
      input.priceMax !== undefined ||
      input.minRating !== undefined
    ) {
      // Category / filter browsing without a text query.
      let all = await services.productService.getAll({
        category: input.category,
        limit,
        sort,
      });
      // Apply price/rating filters that productService.getAll doesn't support natively.
      all = applyClientFilters(all, input);
      products = all;
    } else {
      // No criteria at all — return trending.
      products = await services.productService.getTrending(limit);
    }

    const summaries = products.map(toProductSummary);

    return ok({ products: summaries, totalCount: summaries.length });
  }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/**
 * Client-side price/rating filter for the `productService.getAll()` path
 * (which only supports category filtering natively).
 */
function applyClientFilters<T extends { price: number; rating: number }>(
  products: T[],
  input: ProductSearchInput,
): T[] {
  return products.filter((p) => {
    if (input.priceMin !== undefined && p.price < input.priceMin) return false;
    if (input.priceMax !== undefined && p.price > input.priceMax) return false;
    if (input.minRating !== undefined && p.rating < input.minRating) return false;
    return true;
  });
}
