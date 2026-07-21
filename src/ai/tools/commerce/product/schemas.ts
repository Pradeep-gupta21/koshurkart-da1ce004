import type { JSONSchema } from "@/ai/types/chat";

/**
 * Provider-agnostic JSON-Schema definitions for Product Tools.
 */
export const ProductSearchSchema: JSONSchema = {
  type: "object",
  description: "Search for products in the catalog",
  properties: {
    query: { type: "string", description: "Search term" },
    category: { type: "string", description: "Optional category filter" },
    minPrice: { type: "number", description: "Optional minimum price filter" },
    maxPrice: { type: "number", description: "Optional maximum price filter" },
    vendorId: { type: "string", description: "Optional vendor ID filter" },
    limit: { type: "number", description: "Optional limit for number of results" },
  },
  required: ["query"],
};
