import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export interface GetProductInput {
  productId?: string;
  slug?: string;
}

export class GetProductTool extends BaseCommerceTool<GetProductInput, any> {
  readonly name = "get_product";
  readonly description = "Get detailed information about a specific product by its ID or slug.";
  
  readonly parameters: any = {
    type: "object",
    properties: {
      productId: {
        type: "string",
        description: "The unique ID of the product.",
      },
      slug: {
        type: "string",
        description: "The slug of the product.",
      },
    },
  };

  protected validate(input: GetProductInput): string | null {
    if (!input.productId && !input.slug) {
      return "Must provide either productId or slug.";
    }
    return null;
  }

  protected async run(
    input: GetProductInput,
    context: CommerceToolContext
  ): Promise<ToolResult<any>> {
    const productService = context.services?.product;

    if (!productService) {
      return err({
        code: "unavailable",
        message: "Product service is not available in the current context.",
        retryable: true,
      });
    }

    try {
      let result;
      if (input.productId) {
        result = await productService.getProductById(input.productId);
      } else if (input.slug) {
        result = await productService.getBySlug(input.slug);
      } else {
        return err("Invalid input");
      }

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
