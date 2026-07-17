import type { JSONSchema } from "@/ai/types/chat";

/**
 * Provider-agnostic JSON-Schema definitions for Order Tools.
 */
export const OrderStatusSchema: JSONSchema = {
  type: "object",
  description: "Check the status of an order",
  properties: {
    orderId: { type: "string", description: "ID of the order" },
  },
  required: ["orderId"],
};
