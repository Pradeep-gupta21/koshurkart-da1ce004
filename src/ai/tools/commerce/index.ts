import type { ToolRegistry } from "../registry";

export * from "./types";
export * from "./base-commerce.tool";

/**
 * Registers all commerce-related tools into the provided registry.
 * Concrete tool implementations will be wired up here in the future.
 */
export function registerCommerceTools(registry: ToolRegistry): ToolRegistry {
  // registry.registerMany([...]);
  return registry;
}
