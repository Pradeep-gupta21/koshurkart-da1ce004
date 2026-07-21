import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export interface GetSimilarProductsInput {
  productId: string;
  limit?: number;
}

export interface GetSimilarProductsOutput {
  sourceProduct: any;
  similarProducts: any[];
}

export class GetSimilarProductsTool extends BaseCommerceTool<GetSimilarProductsInput, GetSimilarProductsOutput> {
  readonly name = "get_similar_products";
  readonly description = "Get similar products based on a given product ID (uses category matching).";
  
  readonly parameters: any = {
    type: "object",
    properties: {
      productId: {
        type: "string",
        description: "The ID of the product to find similar items for.",
      },
      limit: {
        type: "number",
        description: "Optional limit for the number of similar products.",
      },
    },
    required: ["productId"],
  };

  protected validate(input: GetSimilarProductsInput): string | null {
    if (!input.productId || typeof input.productId !== "string") {
      return "productId must be a valid string.";
    }
    if (input.limit !== undefined && (typeof input.limit !== "number" || input.limit <= 0)) {
      return "limit must be a positive number.";
    }
    return null;
  }

  protected async run(
    input: GetSimilarProductsInput,
    context: CommerceToolContext
  ): Promise<ToolResult<GetSimilarProductsOutput>> {
    const productService = context.services?.product;
    if (!productService) {
      return err({ code: "unavailable", message: "Product service is not available." });
    }

    try {
      // 1. Get the source product
      const productResult = await productService.getProductById(input.productId);
      if (!(productResult as any).success) {
        return err({ code: "execution_error", message: (productResult as any).error.message });
      }
      const sourceProduct = (productResult as any).data;
      if (!sourceProduct) {
         return err({ code: "execution_error", message: "Source product not found." });
      }

      // 2. Fetch similar products (using the category as a heuristic)
      const searchResult = await productService.searchProducts("", {
        category: sourceProduct.category,
        limit: (input.limit || 5) + 1, // Add 1 because we'll filter out the source product
      });
      
      if (!(searchResult as any).success) {
        return err({ code: "execution_error", message: (searchResult as any).error.message });
      }

      const similarProducts = (searchResult as any).data
        .filter((p: any) => p.id !== input.productId)
        .slice(0, input.limit || 5);

      return ok({
        sourceProduct,
        similarProducts,
      });
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
