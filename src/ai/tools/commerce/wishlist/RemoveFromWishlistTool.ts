/**
 * KoshurKart — RemoveFromWishlistTool
 * =================================================================
 * Removes a specific product from the authenticated customer's wishlist.
 * Reads the user ID from the execution context (context.userId).
 * Delegates entirely to IWishlistService — no data access of its own.
 */

import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export interface RemoveFromWishlistInput {
  productId: string;
}

export interface RemoveFromWishlistOutput {
  message: string;
}

export class RemoveFromWishlistTool extends BaseCommerceTool<RemoveFromWishlistInput, RemoveFromWishlistOutput> {
  readonly name = "remove_from_wishlist";
  readonly description =
    "Remove a product from the customer's wishlist. Use when the customer says 'remove from wishlist', 'unsave this', 'delete from saved items', or similar.";

  /** Only customer-facing agents may call this tool. */
  readonly audiences = ["customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      productId: {
        type: "string",
        description: "The unique ID of the product to remove from the wishlist.",
      },
    },
    required: ["productId"],
  };

  protected validate(input: RemoveFromWishlistInput): string | null {
    if (!input.productId || typeof input.productId !== "string" || input.productId.trim().length === 0) {
      return "productId is required and must be a non-empty string.";
    }
    return null;
  }

  protected async run(
    input: RemoveFromWishlistInput,
    context: CommerceToolContext
  ): Promise<ToolResult<RemoveFromWishlistOutput>> {
    if (!context.userId) {
      return err({
        code: "unauthorized",
        message: "You must be signed in to modify your wishlist.",
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

    const result = await wishlistService.removeFromWishlist(context.userId, input.productId);

    if (!result.success) {
      return err({
        code: "execution_error",
        message: result.error?.message ?? "Failed to remove item from wishlist.",
      });
    }

    return ok({ message: "Product removed from your wishlist." });
  }
}
