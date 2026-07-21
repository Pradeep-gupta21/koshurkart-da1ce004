import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export interface GetFeaturedProductsInput {
  limit?: number;
}

export class GetFeaturedProductsTool extends BaseCommerceTool<GetFeaturedProductsInput, any[]> {
  readonly name = "get_featured_products";
  readonly description = "Get a list of featured or trending products.";
  
  readonly parameters: any = {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "The maximum number of products to return.",
      },
    },
  };

  protected validate(input: GetFeaturedProductsInput): string | null {
    if (input.limit !== undefined && (typeof input.limit !== "number" || input.limit <= 0)) {
      return "limit must be a positive number.";
    }
    return null;
  }

  protected async run(
    input: GetFeaturedProductsInput,
    context: CommerceToolContext
  ): Promise<ToolResult<any[]>> {
    const productService = context.services?.product;

    if (!productService) {
      return err({
        code: "unavailable",
        message: "Product service is not available in the current context.",
        retryable: true,
      });
    }

    try {
      const result = await productService.getTrending(input.limit || 10);

      if (!result.success) {
        return err({
          code: "execution_error",
          message: result.error.message,
        });
      }

      return ok(result.data);
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
