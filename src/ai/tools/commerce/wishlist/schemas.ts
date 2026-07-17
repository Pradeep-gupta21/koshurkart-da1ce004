import type { JSONSchema } from "@/ai/types/chat";

/**
 * Provider-agnostic JSON-Schema definitions for Wishlist Tools.
 */
export const WishlistAddSchema: JSONSchema = {
  type: "object",
  description: "Add a product to the user's wishlist",
  properties: {
    productId: { type: "string", description: "ID of the product" },
  },
  required: ["productId"],
};
