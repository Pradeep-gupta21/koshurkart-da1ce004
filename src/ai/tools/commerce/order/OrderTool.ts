import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export type OrderAction = "get" | "list" | "track" | "cancel";

export interface OrderInput {
  action: OrderAction;
  orderId?: string;
  reason?: string;
  limit?: number;
  offset?: number;
}

export interface OrderOutput {
  order?: any;
  orders?: any[];
  tracking?: any;
  message?: string;
}

export class OrderTool extends BaseCommerceTool<OrderInput, OrderOutput> {
  readonly name = "order";
  readonly description = "Manage and retrieve customer orders (get, list, track, cancel).";
  
  readonly parameters = {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["get", "list", "track", "cancel"],
        description: "The order action to perform.",
      },
      orderId: {
        type: "string",
        description: "The ID of the order. Required for get, track, and cancel actions.",
      },
      reason: {
        type: "string",
        description: "Optional reason for cancelling an order.",
      },
      limit: {
        type: "number",
        description: "Optional limit for the number of orders to list.",
      },
      offset: {
        type: "number",
        description: "Optional offset for listing orders (pagination).",
      },
    },
    required: ["action"],
  } as const;

  protected validate(input: OrderInput): string | null {
    if (!["get", "list", "track", "cancel"].includes(input.action)) {
      return "Invalid action. Must be 'get', 'list', 'track', or 'cancel'.";
    }

    if (["get", "track", "cancel"].includes(input.action) && !input.orderId) {
      return `orderId is required for '${input.action}' action.`;
    }

    if (input.action === "list") {
      if (input.limit !== undefined && (typeof input.limit !== "number" || input.limit <= 0)) {
        return "limit must be a positive number.";
      }
      if (input.offset !== undefined && (typeof input.offset !== "number" || input.offset < 0)) {
        return "offset must be a non-negative number.";
      }
    }

    return null; // Valid
  }

  protected async run(
    input: OrderInput,
    context: CommerceToolContext
  ): Promise<ToolResult<OrderOutput>> {
    const orderService = context.services?.order;

    if (!orderService) {
      return err({
        code: "unavailable",
        message: "Order service is not available in the current context.",
        retryable: true,
      });
    }

    try {
      let message = "";
      let order: any;
      let orders: any[] | undefined;
      let tracking: any;

      switch (input.action) {
        case "get":
          order = await orderService.getOrder(input.orderId!);
          message = "Order retrieved successfully.";
          return ok({ order, message });

        case "list":
          orders = await orderService.listOrders({
            limit: input.limit,
            offset: input.offset,
          });
          message = "Orders listed successfully.";
          return ok({ orders, message });

        case "track":
          tracking = await orderService.trackOrder(input.orderId!);
          message = "Order tracking retrieved successfully.";
          return ok({ tracking, message });

        case "cancel":
          order = await orderService.cancelOrder(input.orderId!, input.reason);
          message = "Order cancelled successfully.";
          return ok({ order, message });
      }
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
