/**
 * KoshurKart — UpdateCartQuantityTool
 * =================================================================
 * Updates the quantity of a product already in the customer's cart.
 * Setting quantity to 0 removes the item (delegated to service logic).
 * Reads the customer ID from the execution context (context.userId).
 * Delegates entirely to ICartService — no data access of its own.
 */

import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export interface UpdateCartQuantityInput {
  productId: string;
  quantity: number;
}

export interface UpdateCartQuantityOutput {
  message: string;
}

export class UpdateCartQuantityTool extends BaseCommerceTool<UpdateCartQuantityInput, UpdateCartQuantityOutput> {
  readonly name = "update_cart_quantity";
  readonly description =
    "Update the quantity of a product already in the customer's cart. Use when the customer says 'change quantity to X', 'I want 3 of this', 'update my cart', etc. Setting quantity to 0 removes the item.";

  /** Only customer-facing agents may call this tool. */
  readonly audiences = ["customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      productId: {
        type: "string",
        description: "The unique ID of the product whose quantity should be updated.",
      },
      quantity: {
        type: "number",
        description:
          "The new quantity. Must be a non-negative integer. Use 0 to remove the item from the cart.",
      },
    },
    required: ["productId", "quantity"],
  };

  protected validate(input: UpdateCartQuantityInput): string | null {
    if (!input.productId || typeof input.productId !== "string" || input.productId.trim().length === 0) {
      return "productId is required and must be a non-empty string.";
    }
    if (typeof input.quantity !== "number" || !Number.isInteger(input.quantity) || input.quantity < 0) {
      return "quantity must be a non-negative integer (use 0 to remove the item).";
    }
    return null;
  }

  protected async run(
    input: UpdateCartQuantityInput,
    context: CommerceToolContext
  ): Promise<ToolResult<UpdateCartQuantityOutput>> {
    if (!context.userId) {
      return err({
        code: "unauthorized",
        message: "You must be signed in to update your cart.",
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

    const result = await cartService.updateQuantity(
      context.userId,
      input.productId,
      input.quantity
    );

    if (!result.success) {
      return err({
        code: "execution_error",
        message: result.error?.message ?? "Failed to update cart quantity.",
      });
    }

    const message =
      input.quantity === 0
        ? "Item removed from your cart."
        : `Cart updated — quantity is now ${input.quantity}.`;

    return ok({ message });
  }
}
