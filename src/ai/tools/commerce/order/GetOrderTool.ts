import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export interface GetOrderInput {
  orderId: string;
}

export interface GetOrderOutput {
  order: any;
  message: string;
}

export class GetOrderTool extends BaseCommerceTool<GetOrderInput, GetOrderOutput> {
  readonly name = "get_order";
  readonly description = "Retrieve a specific order by its ID.";

  readonly audiences = ["admin", "customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      orderId: {
        type: "string",
        description: "The ID of the order to retrieve.",
      },
    },
    required: ["orderId"],
  };

  protected validate(input: GetOrderInput): string | null {
    if (!input.orderId) {
      return "orderId is required.";
    }
    return null;
  }

  protected async run(
    input: GetOrderInput,
    context: CommerceToolContext
  ): Promise<ToolResult<GetOrderOutput>> {
    const orderService = context.services?.order;
    if (!orderService) {
      return err({
        code: "unavailable",
        message: "Order service is not available in the current context.",
        retryable: true,
      });
    }

    try {
      const result = await orderService.getOrder(input.orderId);
      if (!result.success) {
        return err({
          code: "execution_error",
          message: result.error?.message ?? "Failed to retrieve order.",
        });
      }

      return ok({
        order: result.data,
        message: "Order retrieved successfully.",
      });
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
