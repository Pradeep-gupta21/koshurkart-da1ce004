/**
 * KoshurKart — GetWishlistTool
 * =================================================================
 * Retrieves all items saved in the authenticated customer's wishlist.
 * Reads the user ID from the execution context (context.userId).
 * Delegates entirely to IWishlistService — no data access of its own.
 */

import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

/** GetWishlistTool takes no user-facing parameters — auth comes from context. */
export type GetWishlistInput = Record<string, never>;

export interface GetWishlistOutput {
  items: any[];
  itemCount: number;
  message: string;
}

export class GetWishlistTool extends BaseCommerceTool<GetWishlistInput, GetWishlistOutput> {
  readonly name = "get_wishlist";
  readonly description =
    "Retrieve all items saved in the customer's wishlist. ALWAYS call this tool when the customer asks 'show my wishlist', 'what have I saved?', 'my saved items', etc. Never answer wishlist state from memory.";

  /** Only customer-facing agents may call this tool. */
  readonly audiences = ["customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {},
    required: [],
  };

  // No input fields to validate.
  protected validate(_input: GetWishlistInput): string | null {
    return null;
  }

  protected async run(
    _input: GetWishlistInput,
    context: CommerceToolContext
  ): Promise<ToolResult<GetWishlistOutput>> {
    if (!context.userId) {
      return err({
        code: "unauthorized",
        message: "You must be signed in to view your wishlist.",
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

    const result = await wishlistService.getWishlist(context.userId);

    if (!result.success) {
      return err({
        code: "execution_error",
        message: result.error?.message ?? "Failed to retrieve wishlist.",
      });
    }

    const items: any[] = Array.isArray(result.data) ? result.data : [];
    const itemCount = items.length;

    return ok({
      items,
      itemCount,
      message: itemCount === 0 ? "Your wishlist is empty." : `Your wishlist has ${itemCount} saved item(s).`,
    });
  }
}
