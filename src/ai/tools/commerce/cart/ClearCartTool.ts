/**
 * KoshurKart — ClearCartTool
 * =================================================================
 * Removes all items from the authenticated customer's shopping cart.
 * Reads the customer ID from the execution context (context.userId).
 * Delegates entirely to ICartService — no data access of its own.
 */

import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export type ClearCartInput = Record<string, never>;

export interface ClearCartOutput {
  message: string;
}

export class ClearCartTool extends BaseCommerceTool<ClearCartInput, ClearCartOutput> {
  readonly name = "clear_cart";
  readonly description =
    "Removes all items from the customer's shopping cart. Use when the customer says 'empty my cart', 'clear my cart', or 'remove everything from my cart'.";

  /** Only customer-facing agents may call this tool. */
  readonly audiences = ["customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {},
    required: [],
  };

  protected validate(_input: ClearCartInput): string | null {
    return null;
  }

  protected async run(
    _input: ClearCartInput,
    context: CommerceToolContext
  ): Promise<ToolResult<ClearCartOutput>> {
    if (!context.userId) {
      return err({
        code: "unauthorized",
        message: "You must be signed in to clear your cart.",
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

    const result = await cartService.clearCart(context.userId);

    if (!result.success) {
      return err({
        code: "execution_error",
        message: result.error?.message ?? "Failed to clear cart.",
      });
    }

    return ok({
      message: "Your cart has been emptied successfully.",
    });
  }
}
