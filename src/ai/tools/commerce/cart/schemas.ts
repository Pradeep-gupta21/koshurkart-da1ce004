import type { JSONSchema } from "@/ai/types/chat";

/**
 * Provider-agnostic JSON-Schema definitions for Cart Tools.
 */
export const CartAddSchema: JSONSchema = {
  type: "object",
  description: "Add an item to the shopping cart",
  properties: {
    productId: { type: "string", description: "ID of the product" },
    quantity: { type: "number", description: "Quantity to add" },
  },
  required: ["productId"],
};
