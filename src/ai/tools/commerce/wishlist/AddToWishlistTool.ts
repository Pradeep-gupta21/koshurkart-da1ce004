/**
 * KoshurKart — AddToWishlistTool
 * =================================================================
 * Saves a product to the authenticated customer's wishlist.
 * Reads the user ID from the execution context (context.userId).
 * Delegates entirely to IWishlistService — no data access of its own.
 */

import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export interface AddToWishlistInput {
  productId: string;
}

export interface AddToWishlistOutput {
  message: string;
}

export class AddToWishlistTool extends BaseCommerceTool<AddToWishlistInput, AddToWishlistOutput> {
  readonly name = "add_to_wishlist";
  readonly description =
    "Save a product to the customer's wishlist. Use when the customer says 'save for later', 'add to wishlist', 'remember this product', 'I like this but not buying now', or similar.";

  /** Only customer-facing agents may call this tool. */
  readonly audiences = ["customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      productId: {
        type: "string",
        description: "The unique ID of the product to save to the wishlist.",
      },
    },
    required: ["productId"],
  };

  protected validate(input: AddToWishlistInput): string | null {
    if (!input.productId || typeof input.productId !== "string" || input.productId.trim().length === 0) {
      return "productId is required and must be a non-empty string.";
    }
    return null;
  }

  protected async run(
    input: AddToWishlistInput,
    context: CommerceToolContext
  ): Promise<ToolResult<AddToWishlistOutput>> {
    if (!context.userId) {
      return err({
        code: "unauthorized",
        message: "You must be signed in to add items to your wishlist.",
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

    const result = await wishlistService.addToWishlist(context.userId, input.productId);

    if (!result.success) {
      return err({
        code: "execution_error",
        message: result.error?.message ?? "Failed to add item to wishlist.",
      });
    }

    return ok({ message: "Product saved to your wishlist." });
  }
}
