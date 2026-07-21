/**
 * KoshurKart — AddToCartTool
 * =================================================================
 * Adds a product to the authenticated customer's shopping cart.
 * Reads the customer ID from the execution context (context.userId).
 * Delegates entirely to ICartService — no data access of its own.
 */

import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export interface AddToCartInput {
  productId: string;
  quantity?: number;
}

export interface AddToCartOutput {
  orderId: string;
  message: string;
}

export class AddToCartTool extends BaseCommerceTool<AddToCartInput, AddToCartOutput> {
  readonly name = "add_to_cart";
  readonly description =
    "Add a product to the customer's shopping cart. Use when the customer says 'add to cart', 'buy this', 'put X in my cart', or similar purchase-intent phrases.";

  /** Only customer-facing agents may call this tool. */
  readonly audiences = ["customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      productId: {
        type: "string",
        description: "The unique ID of the product to add to the cart.",
      },
      quantity: {
        type: "number",
        description: "Number of units to add. Defaults to 1 if not specified.",
      },
    },
    required: ["productId"],
  };

  protected validate(input: AddToCartInput): string | null {
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
    input: AddToCartInput,
    context: CommerceToolContext
  ): Promise<ToolResult<AddToCartOutput>> {
    if (!context.userId) {
      return err({
        code: "unauthorized",
        message: "You must be signed in to add items to your cart.",
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

    const result = await cartService.addToCart(
      context.userId,
      input.productId,
      input.quantity ?? 1
    );

    if (!result.success) {
      return err({
        code: "execution_error",
        message: result.error?.message ?? "Failed to add item to cart.",
      });
    }

    return ok({
      orderId: result.data?.orderId ?? "",
      message: "Item added to your cart successfully.",
    });
  }
}
