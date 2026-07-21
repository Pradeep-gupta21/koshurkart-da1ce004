/**
 * KoshurKart — RemoveFromCartTool
 * =================================================================
 * Removes a specific product from the authenticated customer's cart.
 * Reads the customer ID from the execution context (context.userId).
 * Delegates entirely to ICartService — no data access of its own.
 */

import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export interface RemoveFromCartInput {
  productId: string;
}

export interface RemoveFromCartOutput {
  message: string;
}

export class RemoveFromCartTool extends BaseCommerceTool<RemoveFromCartInput, RemoveFromCartOutput> {
  readonly name = "remove_from_cart";
  readonly description =
    "Remove a product from the customer's shopping cart. Use when the customer says 'remove from cart', 'delete this item', 'take X out of my cart', or similar phrases.";

  /** Only customer-facing agents may call this tool. */
  readonly audiences = ["customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      productId: {
        type: "string",
        description: "The unique ID of the product to remove from the cart.",
      },
    },
    required: ["productId"],
  };

  protected validate(input: RemoveFromCartInput): string | null {
    if (!input.productId || typeof input.productId !== "string" || input.productId.trim().length === 0) {
      return "productId is required and must be a non-empty string.";
    }
    return null;
  }

  protected async run(
    input: RemoveFromCartInput,
    context: CommerceToolContext
  ): Promise<ToolResult<RemoveFromCartOutput>> {
    if (!context.userId) {
      return err({
        code: "unauthorized",
        message: "You must be signed in to modify your cart.",
        retryable: false,
      });
    }

    const cartService = context.services?.cart;
    if (!cartService) {
      return err({
        code: "unavailable",
        message: "Cart service is not available. Please try again later.",
        retryable: true,
      });
    }

    const result = await cartService.removeFromCart(context.userId, input.productId);

    if (!result.success) {
      return err({
        code: "execution_error",
        message: result.error?.message ?? "Failed to remove item from cart.",
      });
    }

    return ok({ message: "Item removed from your cart successfully." });
  }
}
