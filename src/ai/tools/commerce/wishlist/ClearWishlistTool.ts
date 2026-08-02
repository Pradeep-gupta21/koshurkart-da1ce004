/**
 * KoshurKart — ClearWishlistTool
 * =================================================================
 * Clears all items from the authenticated customer's wishlist.
 * Reads the user ID from the execution context (context.userId).
 * Delegates entirely to IWishlistService — no data access of its own.
 */

import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export interface ClearWishlistInput {}

export interface ClearWishlistOutput {
  message: string;
}

export class ClearWishlistTool extends BaseCommerceTool<ClearWishlistInput, ClearWishlistOutput> {
  readonly name = "clear_wishlist";
  readonly description =
    "Clear all products from the customer's wishlist. Use when the customer says 'clear my wishlist', 'empty my saved items', or similar.";

  /** Only customer-facing agents may call this tool. */
  readonly audiences = ["customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {},
    required: [],
  };

  protected validate(input: ClearWishlistInput): string | null {
    return null;
  }

  protected async run(
    input: ClearWishlistInput,
    context: CommerceToolContext
  ): Promise<ToolResult<ClearWishlistOutput>> {
    if (!context.userId) {
      return err({
        code: "unauthorized",
        message: "You must be signed in to clear your wishlist.",
        retryable: false,
      });
    }

    const wishlistService = context.services?.wishlist;
    if (!wishlistService) {
      return err({
        code: "unavailable",
        message: "Wishlist service is not available. Please try again later.",
        retryable: true,
      });
    }

    const result = await wishlistService.clearWishlist(context.userId);

    if (!result.success) {
      return err({
        code: "execution_error",
        message: result.error?.message ?? "Failed to clear wishlist.",
      });
    }

    return ok({ message: "Your wishlist has been cleared." });
  }
}
