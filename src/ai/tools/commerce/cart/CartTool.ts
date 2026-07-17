import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export type CartAction = "get" | "add" | "remove" | "update";

export interface CartInput {
  action: CartAction;
  productId?: string;
  quantity?: number;
}

export interface CartOutput {
  cart: any;
  message?: string;
}

export class CartTool extends BaseCommerceTool<CartInput, CartOutput> {
  readonly name = "cart";
  readonly description = "Manage the shopping cart (get, add, remove, update items).";
  
  readonly parameters = {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["get", "add", "remove", "update"],
        description: "The cart action to perform.",
      },
      productId: {
        type: "string",
        description: "The ID of the product. Required for add, remove, and update actions.",
      },
      quantity: {
        type: "number",
        description: "The quantity of the product. Used for add (defaults to 1) and update actions.",
      },
    },
    required: ["action"],
  } as const;

  protected validate(input: CartInput): string | null {
    if (!["get", "add", "remove", "update"].includes(input.action)) {
      return "Invalid action. Must be 'get', 'add', 'remove', or 'update'.";
    }

    if (input.action === "add") {
      if (!input.productId) return "productId is required for 'add' action.";
      if (input.quantity !== undefined && (typeof input.quantity !== "number" || input.quantity <= 0)) {
        return "quantity must be a positive number for 'add' action.";
      }
    } else if (input.action === "remove") {
      if (!input.productId) return "productId is required for 'remove' action.";
    } else if (input.action === "update") {
      if (!input.productId) return "productId is required for 'update' action.";
      if (typeof input.quantity !== "number" || input.quantity < 0) {
        return "quantity is required and must be a non-negative number for 'update' action.";
      }
    }

    return null; // Valid
  }

  protected async run(
    input: CartInput,
    context: CommerceToolContext
  ): Promise<ToolResult<CartOutput>> {
    const cartService = context.services?.cart;

    if (!cartService) {
      return err({
        code: "unavailable",
        message: "Cart service is not available in the current context.",
        retryable: true,
      });
    }

    try {
      let cartResult: any;
      let message = "";

      switch (input.action) {
        case "get":
          cartResult = await cartService.getCart();
          message = "Cart retrieved successfully.";
          break;
        case "add":
          cartResult = await cartService.addItem(input.productId!, input.quantity);
          message = "Item added to cart successfully.";
          break;
        case "remove":
          cartResult = await cartService.removeItem(input.productId!);
          message = "Item removed from cart successfully.";
          break;
        case "update":
          cartResult = await cartService.updateQuantity(input.productId!, input.quantity!);
          message = "Cart updated successfully.";
          break;
      }

      return ok({
        cart: cartResult,
        message,
      });
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
