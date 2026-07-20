import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export type WishlistAction = "get" | "add" | "remove" | "check";

export interface WishlistInput {
  action: WishlistAction;
  productId?: string;
}

export interface WishlistOutput {
  wishlist?: any;
  isWishlisted?: boolean;
  message?: string;
}

export class WishlistTool extends BaseCommerceTool<WishlistInput, WishlistOutput> {
  readonly name = "wishlist";
  readonly description = "Manage the user's wishlist (get, add, remove, check items).";
  
  readonly parameters: any = {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["get", "add", "remove", "check"],
        description: "The wishlist action to perform.",
      },
      productId: {
        type: "string",
        description: "The ID of the product. Required for add, remove, and check actions.",
      },
    },
    required: ["action"],
  };

  protected validate(input: WishlistInput): string | null {
    if (!["get", "add", "remove", "check"].includes(input.action)) {
      return "Invalid action. Must be 'get', 'add', 'remove', or 'check'.";
    }

    if (["add", "remove", "check"].includes(input.action) && !input.productId) {
      return `productId is required for '${input.action}' action.`;
    }

    return null; // Valid
  }

  protected async run(
    input: WishlistInput,
    context: CommerceToolContext
  ): Promise<ToolResult<WishlistOutput>> {
    const wishlistService = context.services?.wishlist;

    if (!wishlistService) {
      return err({
        code: "unavailable",
        message: "Wishlist service is not available in the current context.",
        retryable: true,
      });
    }

    try {
      let message = "";
      let wishlistResult: any;
      let isWishlisted: boolean | undefined;

      switch (input.action) {
        case "get":
          wishlistResult = await wishlistService.getWishlist();
          message = "Wishlist retrieved successfully.";
          return ok({ wishlist: wishlistResult, message });

        case "add":
          wishlistResult = await wishlistService.addItem(input.productId!);
          message = "Item added to wishlist successfully.";
          return ok({ wishlist: wishlistResult, message });

        case "remove":
          wishlistResult = await wishlistService.removeItem(input.productId!);
          message = "Item removed from wishlist successfully.";
          return ok({ wishlist: wishlistResult, message });

        case "check":
          isWishlisted = await wishlistService.checkItem(input.productId!);
          message = isWishlisted ? "Item is in the wishlist." : "Item is not in the wishlist.";
          return ok({ isWishlisted, message });
      }
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
