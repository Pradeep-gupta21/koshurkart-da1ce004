import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export interface TrackOrderInput {
  orderId: string;
}

export interface TrackOrderOutput {
  trackingEvents: any[];
  message: string;
}

export class TrackOrderTool extends BaseCommerceTool<TrackOrderInput, TrackOrderOutput> {
  readonly name = "track_order";
  readonly description = "Retrieve tracking and shipment events for a specific order.";

  readonly audiences = ["customer"] as const;

  readonly parameters: any = {
    type: "object",
    properties: {
      orderId: {
        type: "string",
        description: "The ID of the order to track.",
      },
    },
    required: ["orderId"],
  };

  protected validate(input: TrackOrderInput): string | null {
    if (!input.orderId) {
      return "orderId is required.";
    }
    return null;
  }

  protected async run(
    input: TrackOrderInput,
    context: CommerceToolContext
  ): Promise<ToolResult<TrackOrderOutput>> {
    const orderService = context.services?.order;
    if (!orderService) {
      return err({
        code: "unavailable",
        message: "Order service is not available in the current context.",
        retryable: true,
      });
    }

    try {
      const result = await orderService.trackOrder(input.orderId);
      if (!result.success) {
        return err({
          code: "execution_error",
          message: result.error?.message ?? "Failed to retrieve order tracking.",
        });
      }

      const trackingEvents = result.data ?? [];
      return ok({
        trackingEvents,
        message: trackingEvents.length === 0 
          ? "No tracking events found for this order." 
          : "Order tracking retrieved successfully.",
      });
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
