/**
 * KoshurKart — GetCartTool
 * =================================================================
 * Retrieves the authenticated customer's current cart (draft order)
 * including all items, quantities, and totals.
 * Reads the customer ID from the execution context (context.userId).
 * Delegates entirely to ICartService — no data access of its own.
 */

import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

/** GetCartTool takes no user-facing parameters — auth comes from context. */
export type GetCartInput = Record<string, never>;

export interface GetCartOutput {
  products: Array<{
    productId: string;
    title: string;
    price: number;
    quantity: number;
  }>;
  quantities: number;
  subtotal: number;
  totalItems: number;
  message: string;
  cart?: any;
}

export class GetCartTool extends BaseCommerceTool<GetCartInput, GetCartOutput> {
  readonly name = "get_cart";
  readonly description =
    "Retrieve the customer's current shopping cart with all items and totals. ALWAYS call this tool when the customer asks 'what's in my cart?', 'show my cart', 'view cart', etc. Never answer cart state from memory.";

  /** Only customer-facing agents may call this tool. */
  readonly audiences = ["customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {},
    required: [],
  };

  // No input fields to validate.
  protected validate(_input: GetCartInput): string | null {
    return null;
  }

  protected async run(
    _input: GetCartInput,
    context: CommerceToolContext
  ): Promise<ToolResult<GetCartOutput>> {
    if (!context.userId) {
      return err({
        code: "unauthorized",
        message: "You must be signed in to view your cart.",
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

    const result = await cartService.getCart(context.userId);

    if (!result.success) {
      return err({
        code: "execution_error",
        message: result.error?.message ?? "Failed to retrieve cart.",
      });
    }

    const cart = result.data ?? { order_items: [] };
    const items = Array.isArray(cart.order_items) ? cart.order_items : [];
    
    const products = items.map((item: any) => ({
      productId: item.product_id,
      title: item.title,
      price: item.price,
      quantity: item.quantity,
    }));
    
    const quantities = items.reduce((acc: number, item: any) => acc + item.quantity, 0);
    const subtotal = items.reduce((acc: number, item: any) => acc + (item.price * item.quantity), 0);
    const totalItems = items.length;

    return ok({
      products,
      quantities,
      subtotal,
      totalItems,
      cart,
      message: totalItems === 0 ? "Your cart is empty." : `Your cart has ${totalItems} item(s) (${quantities} total units) with a subtotal of ₹${subtotal}.`,
    });
  }
}
