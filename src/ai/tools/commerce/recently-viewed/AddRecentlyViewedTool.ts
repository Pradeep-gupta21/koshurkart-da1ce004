import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";
import { RecentlyViewedStore } from "./store";

export interface AddRecentlyViewedInput {
  productId: string;
}

export class AddRecentlyViewedTool extends BaseCommerceTool<AddRecentlyViewedInput, any> {
  readonly name = "add_recently_viewed";
  readonly description = "Explicitly add a product to the customer's recently viewed history.";
  
  readonly parameters: any = {
    type: "object",
    properties: {
      productId: {
        type: "string",
        description: "The unique ID of the product to add to history.",
      }
    },
    required: ["productId"]
  };

  protected validate(input: AddRecentlyViewedInput): string | null {
    if (!input.productId) {
      return "Must provide productId.";
    }
    return null;
  }

  protected async run(
    input: AddRecentlyViewedInput,
    context: CommerceToolContext
  ): Promise<ToolResult<any>> {
    if (!context.customer?.id) {
      return err({
        code: "unauthorized",
        message: "You must be logged in to update your recently viewed products.",
      });
    }

    const productService = context.services?.product;
    if (!productService) {
      return err({
        code: "unavailable",
        message: "Product service is not available.",
      });
    }

    try {
      const result = await productService.getProductById(input.productId);
      if (!result.success || !result.data) {
        return err({
          code: "not_found",
          message: "Product not found.",
        });
      }

      RecentlyViewedStore.add(context.customer.id, result.data);

      return ok({
        message: "Product added to recently viewed history."
      });
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
