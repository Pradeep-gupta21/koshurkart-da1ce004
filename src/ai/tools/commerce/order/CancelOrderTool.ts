import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export interface CancelOrderInput {
  orderId: string;
}

export interface CancelOrderOutput {
  order: any;
  message: string;
}

export class CancelOrderTool extends BaseCommerceTool<CancelOrderInput, CancelOrderOutput> {
  readonly name = "cancel_order";
  readonly description = "Cancel a specific order by its ID. Only allowed if the order is in a cancellable state.";

  readonly audiences = ["admin", "customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      orderId: {
        type: "string",
        description: "The ID of the order to cancel.",
      },
    },
    required: ["orderId"],
  };

  protected validate(input: CancelOrderInput): string | null {
    if (!input.orderId) {
      return "orderId is required.";
    }
    return null;
  }

  protected async run(
    input: CancelOrderInput,
    context: CommerceToolContext
  ): Promise<ToolResult<CancelOrderOutput>> {
    const orderService = context.services?.order;
    if (!orderService) {
      return err({
        code: "unavailable",
        message: "Order service is not available in the current context.",
        retryable: true,
      });
    }

    try {
      const result = await orderService.cancelOrder(input.orderId);
      if (!result.success) {
        return err({
          code: "execution_error",
          message: result.error?.message ?? "Failed to cancel order.",
        });
      }

      return ok({
        order: result.data,
        message: "Order cancelled successfully.",
      });
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
