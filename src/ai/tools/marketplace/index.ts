/**
 * KoshurKart — Marketplace tools barrel
 * =================================================================
 * Public surface for the marketplace-specific tool set. Import from
 * here rather than reaching into individual tool files:
 *
 *   import {
 *     ProductSearchTool,
 *     registerMarketplaceTools,
 *   } from "@/ai/tools/marketplace";
 *   import type { MarketplaceServices } from "@/ai/tools/marketplace";
 *
 * Also provides two convenience helpers:
 *  - `createMarketplaceTools()` — returns all four tools as an array.
 *  - `registerMarketplaceTools(registry)` — registers all four tools
 *    on an existing `ToolRegistry`.
 */

import type { ToolRegistry } from "../registry";
import type { AnyTool } from "../types";

import { ProductSearchTool } from "./product-search.tool";
import { ProductRecommendationTool } from "./product-recommendation.tool";
import { OrderLookupTool } from "./order-lookup.tool";
import { VendorAnalyticsTool } from "./vendor-analytics.tool";

/* ---- Types ------------------------------------------------------ */

export type {
  MarketplaceServices,
  MarketplaceSortOption,
  MarketplaceSearchFilters,
  ProductSummary,
  OrderSummary,
  OrderItemSummary,
  ShipmentEventSummary,
  VendorStats,
  TrustMetrics,
  RawVendorAnalytics,
  RawOrder,
  RawOrderItem,
  RawShipmentEvent,
  RawVendor,
} from "./types";

export type { ProductSearchInput, ProductSearchOutput } from "./product-search.tool";
export type { ProductRecommendationInput, ProductRecommendationOutput } from "./product-recommendation.tool";
export type { OrderLookupInput, OrderLookupOutput } from "./order-lookup.tool";
export type { VendorAnalyticsInput, VendorAnalyticsOutput } from "./vendor-analytics.tool";

/* ---- Mappers ---------------------------------------------------- */

export {
  toProductSummary,
  toOrderSummary,
  toOrderItemSummary,
  toShipmentEventSummary,
} from "./types";

/* ---- Tool classes ----------------------------------------------- */

export { ProductSearchTool } from "./product-search.tool";
export { ProductRecommendationTool } from "./product-recommendation.tool";
export { OrderLookupTool } from "./order-lookup.tool";
export { VendorAnalyticsTool } from "./vendor-analytics.tool";

/* ---- Factories -------------------------------------------------- */

/**
 * Create all four marketplace tools. The returned array is ready to
 * be passed to `ToolRegistry.registerMany()` or used individually.
 */
export function createMarketplaceTools(): AnyTool[] {
  return [
    new ProductSearchTool() as unknown as AnyTool,
    new ProductRecommendationTool() as unknown as AnyTool,
    new OrderLookupTool() as unknown as AnyTool,
    new VendorAnalyticsTool() as unknown as AnyTool,
  ];
}

/**
 * Register all marketplace tools on an existing `ToolRegistry`.
 * Convenience wrapper around `createMarketplaceTools()`.
 */
export function registerMarketplaceTools(registry: ToolRegistry): void {
  registry.registerMany(createMarketplaceTools());
}
