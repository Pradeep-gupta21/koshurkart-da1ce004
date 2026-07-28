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
  quantity?: number;
}

export interface RemoveFromCartOutput {
  message: string;
}

export class RemoveFromCartTool extends BaseCommerceTool<RemoveFromCartInput, RemoveFromCartOutput> {
  readonly name = "remove_from_cart";
  readonly description =
    "Remove a product from the customer's shopping cart. Use when the customer says 'remove from cart', 'delete this item', 'take X out of my cart', or similar phrases.";

  /** Both customer and admin agents may call this tool. */
  readonly audiences = ["customer", "admin"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      productId: {
        type: "string",
        description: "The unique ID of the product to remove from the cart.",
      },
      quantity: {
        type: "number",
        description: "Number of units to remove. If not specified, removes the item entirely.",
      },
    },
    required: ["productId"],
  };

  protected validate(input: RemoveFromCartInput): string | null {
    if (!input.productId || typeof input.productId !== "string" || input.productId.trim().length === 0) {
      return "productId is required and must be a non-empty string.";
    }
    if (input.quantity !== undefined) {
      if (typeof input.quantity !== "number" || !Number.isInteger(input.quantity) || input.quantity <= 0) {
        return "quantity must be a positive integer.";
      }
    }
    return null;
  }

  protected async run(
    input: RemoveFromCartInput,
    context: CommerceToolContext
  ): Promise<ToolResult<RemoveFromCartOutput>> {
    console.log(`[DEBUG] RemoveFromCartTool.run START - productId: ${input.productId} at ${new Date().toISOString()}`);
    if (!context.userId) {
      console.log(`[DEBUG] RemoveFromCartTool.run unauthorized at ${new Date().toISOString()}`);
      return err({
        code: "unauthorized",
        message: "You must be signed in to modify your cart.",
        retryable: false,
      });
    }

    const cartService = context.services?.cart;
    if (!cartService) {
      console.log(`[DEBUG] RemoveFromCartTool.run unavailable at ${new Date().toISOString()}`);
      return err({
        code: "unavailable",
        message: "Cart service is not available. Please try again later.",
        retryable: true,
      });
    }

    console.log(`[DEBUG] RemoveFromCartTool.run calling cartService.removeFromCart at ${new Date().toISOString()}`);
    const result = await cartService.removeFromCart(context.userId, input.productId, input.quantity);
    console.log(`[DEBUG] RemoveFromCartTool.run cartService.removeFromCart return at ${new Date().toISOString()}, success: ${result.success}`);

    if (!result.success) {
      console.log(`[DEBUG] RemoveFromCartTool.run returning error at ${new Date().toISOString()}`);
      return err({
        code: "execution_error",
        message: result.error?.message ?? "Failed to remove item from cart.",
      });
    }

    console.log(`[DEBUG] RemoveFromCartTool.run returning ok at ${new Date().toISOString()}`);
    return ok({ message: "Item removed from your cart successfully." });
  }
}
