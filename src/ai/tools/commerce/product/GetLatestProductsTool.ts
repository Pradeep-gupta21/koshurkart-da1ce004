import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export interface GetLatestProductsInput {
  limit?: number;
}

export class GetLatestProductsTool extends BaseCommerceTool<GetLatestProductsInput, any[]> {
  readonly name = "get_latest_products";
  readonly description = "Get a list of the most recently added products.";
  
  readonly parameters: any = {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "The maximum number of products to return.",
      },
    },
  };

  protected validate(input: GetLatestProductsInput): string | null {
    if (input.limit !== undefined && (typeof input.limit !== "number" || input.limit <= 0)) {
      return "limit must be a positive number.";
    }
    return null;
  }

  protected async run(
    input: GetLatestProductsInput,
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
      const result = await productService.getAll({
        sort: 'newest',
        limit: input.limit || 10,
      });

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
