import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export interface ProductSearchInput {
  query: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  vendorId?: string;
  limit?: number;
}

export interface ProductSearchOutput {
  results: any[];
  total: number;
}

export class ProductSearchTool extends BaseCommerceTool<ProductSearchInput, ProductSearchOutput> {
  readonly name = "product_search";
  readonly description = "Search for products based on a query, category, and price range.";
  
  readonly parameters: any = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The main search query or keyword.",
      },
      category: {
        type: "string",
        description: "Optional category filter.",
      },
      minPrice: {
        type: "number",
        description: "Optional minimum price filter.",
      },
      maxPrice: {
        type: "number",
        description: "Optional maximum price filter.",
      },
      vendorId: {
        type: "string",
        description: "Optional vendor ID filter.",
      },
      limit: {
        type: "number",
        description: "Optional limit for the number of results.",
      },
    },
    required: ["query"],
  };

  protected validate(input: ProductSearchInput): string | null {
    if (!input.query || typeof input.query !== "string" || input.query.trim().length === 0) {
      return "Query must be a non-empty string.";
    }
    if (input.minPrice !== undefined && (typeof input.minPrice !== "number" || input.minPrice < 0)) {
      return "minPrice must be a non-negative number.";
    }
    if (input.maxPrice !== undefined && (typeof input.maxPrice !== "number" || input.maxPrice < 0)) {
      return "maxPrice must be a non-negative number.";
    }
    if (input.minPrice !== undefined && input.maxPrice !== undefined && input.minPrice > input.maxPrice) {
      return "minPrice cannot be greater than maxPrice.";
    }
    if (input.limit !== undefined && (typeof input.limit !== "number" || input.limit <= 0)) {
      return "limit must be a positive number.";
    }
    return null; // Valid
  }

  protected async run(
    input: ProductSearchInput,
    context: CommerceToolContext
  ): Promise<ToolResult<ProductSearchOutput>> {
    const productService = context.services?.product;

    if (!productService) {
      return err({
        code: "unavailable",
        message: "Product service is not available in the current context.",
        retryable: true,
      });
    }

    try {
      const result = await productService.searchProducts(input.query, {
        category: input.category,
        minPrice: input.minPrice,
        maxPrice: input.maxPrice,
        vendorId: input.vendorId,
        limit: input.limit,
      });

      if (!(result as any).success) {
        return err({
          code: "execution_error",
          message: (result as any).error.message,
        });
      }

      return ok({
        results: (result as any).data,
        total: (result as any).data.length,
      });
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
