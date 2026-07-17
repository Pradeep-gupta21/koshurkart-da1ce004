import type { JSONSchema } from "@/ai/types/chat";

/**
 * Provider-agnostic JSON-Schema definitions for Product Tools.
 */
export const ProductSearchSchema: JSONSchema = {
  type: "object",
  description: "Search for products in the catalog",
  properties: {
    query: { type: "string", description: "Search term" },
  },
  required: ["query"],
};
