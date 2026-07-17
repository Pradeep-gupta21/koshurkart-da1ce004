import type { ToolRegistry } from "../registry";
import { CommerceToolRegistrar } from "./registration/CommerceToolRegistrar";

export * from "./types";
export * from "./base-commerce.tool";
export * from "./registration";

/**
 * Registers all commerce-related tools into the provided registry.
 * Delegates to CommerceToolRegistrar which manages the full set of
 * concrete tool instances (ProductSearch, Cart, Wishlist, Order, Customer).
 */
export function registerCommerceTools(registry: ToolRegistry): ToolRegistry {
  CommerceToolRegistrar.register(registry);
  return registry;
}
