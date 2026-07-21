import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export interface CompareProductsInput {
  productId1: string;
  productId2: string;
}

export interface CompareProductsOutput {
  product1: any;
  product2: any;
}

export class CompareProductsTool extends BaseCommerceTool<CompareProductsInput, CompareProductsOutput> {
  readonly name = "compare_products";
  readonly description = "Compare two products side-by-side using their product IDs.";
  
  readonly parameters: any = {
    type: "object",
    properties: {
      productId1: {
        type: "string",
        description: "The ID of the first product to compare.",
      },
      productId2: {
        type: "string",
        description: "The ID of the second product to compare.",
      },
    },
    required: ["productId1", "productId2"],
  };

  protected validate(input: CompareProductsInput): string | null {
    if (!input.productId1 || typeof input.productId1 !== "string") {
      return "productId1 must be a valid string.";
    }
    if (!input.productId2 || typeof input.productId2 !== "string") {
      return "productId2 must be a valid string.";
    }
    return null;
  }

  protected async run(
    input: CompareProductsInput,
    context: CommerceToolContext
  ): Promise<ToolResult<CompareProductsOutput>> {
    const productService = context.services?.product;
    if (!productService) {
      return err({ code: "unavailable", message: "Product service is not available." });
    }

    try {
      const result = await productService.getProductsByIds([input.productId1, input.productId2]);
      if (!(result as any).success) {
        return err({ code: "execution_error", message: (result as any).error.message });
      }

      const products = (result as any).data;
      const p1 = products.find((p: any) => p.id === input.productId1) || null;
      const p2 = products.find((p: any) => p.id === input.productId2) || null;

      return ok({
        product1: p1,
        product2: p2,
      });
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
