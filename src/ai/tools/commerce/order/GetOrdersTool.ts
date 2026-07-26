import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export type GetOrdersInput = Record<string, never>;

export interface GetOrdersOutput {
  orders: any[];
  message: string;
}

export class GetOrdersTool extends BaseCommerceTool<GetOrdersInput, GetOrdersOutput> {
  readonly name = "get_orders";
  readonly description = "Retrieve all orders placed by the current customer.";

  readonly audiences = ["customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {},
    required: [],
  };

  protected validate(_input: GetOrdersInput): string | null {
    return null;
  }

  protected async run(
    _input: GetOrdersInput,
    context: CommerceToolContext
  ): Promise<ToolResult<GetOrdersOutput>> {
    if (!context.userId) {
      return err({
        code: "unauthorized",
        message: "You must be signed in to view your orders.",
        retryable: false,
      });
    }

    const orderService = context.services?.order;
    if (!orderService) {
      return err({
        code: "unavailable",
        message: "Order service is not available in the current context.",
        retryable: true,
      });
    }

    try {
      const result = await orderService.getCustomerOrders(context.userId);
      if (!result.success) {
        return err({
          code: "execution_error",
          message: result.error?.message ?? "Failed to retrieve orders.",
        });
      }

      const orders = result.data ?? [];
      const message = orders.length === 0 
        ? "You have no past orders." 
        : `Found ${orders.length} order(s).`;
      return ok({ orders, message });
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
