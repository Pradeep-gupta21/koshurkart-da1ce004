import { BaseCommerceTool } from "../base-commerce.tool";
import type { CommerceToolContext } from "../types";
import { ok, err, ToolResult } from "../../types";

export interface TrackShipmentInput {
  orderId: string;
}

export interface TrackShipmentOutput {
  trackingStatus: string;
  carrier: string;
  estimatedDelivery: string;
  message: string;
  trackingEvents: any[];
}

export class TrackShipmentTool extends BaseCommerceTool<TrackShipmentInput, TrackShipmentOutput> {
  readonly name = "track_shipment";
  readonly description = "Get detailed shipping and tracking status for an order.";

  readonly audiences = ["customer", "admin"] as const;

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

  protected validate(input: TrackShipmentInput): string | null {
    if (!input.orderId) {
      return "orderId is required.";
    }
    return null;
  }

  protected async run(
    input: TrackShipmentInput,
    context: CommerceToolContext
  ): Promise<ToolResult<TrackShipmentOutput>> {
    const orderService = context.services?.order;
    if (!orderService) {
      return err({
        code: "unavailable",
        message: "Order service is not available in the current context.",
        retryable: true,
      });
    }

    try {
      const orderResult = await orderService.getOrder(input.orderId);
      if (!orderResult.success || !orderResult.data) {
        return err({
          code: "not_found",
          message: "Order not found.",
        });
      }

      const order = orderResult.data;
      
      const trackingResult = await orderService.trackOrder(input.orderId);
      const trackingEvents = trackingResult.success && trackingResult.data ? trackingResult.data : [];

      // Determine tracking status from events or fallback to order status
      let trackingStatus = order.shippingStatus || order.status || "Processing";
      let carrier = order.shippingProvider || "Standard Carrier";
      let estimatedDelivery = order.estimatedDelivery ? new Date(order.estimatedDelivery).toDateString() : "Not available yet";
      let message = "Shipment tracking retrieved successfully.";

      if (trackingEvents.length > 0) {
        const latestEvent = trackingEvents[0]; // Assuming first is latest
        trackingStatus = latestEvent.status || trackingStatus;
        if (latestEvent.provider) carrier = latestEvent.provider;
        message = `Latest update: ${latestEvent.description || trackingStatus}`;
      } else {
        if (order.status === 'processing') {
          message = "Order is currently being prepared for shipment.";
          trackingStatus = "pending";
        }
      }

      return ok({
        trackingStatus,
        carrier,
        estimatedDelivery,
        message,
        trackingEvents,
      });
    } catch (e) {
      return err({
        code: "execution_error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
