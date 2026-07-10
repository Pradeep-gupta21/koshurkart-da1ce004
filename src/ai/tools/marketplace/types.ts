/**
 * KoshurKart — Marketplace tool types
 * =================================================================
 * Shared types for the marketplace-specific tool layer. This file
 * defines:
 *
 *  - `MarketplaceServices` — the typed DI service bag that tools
 *    receive through `ToolContext.services`. Every method listed here
 *    is a strict subset of what the corresponding `src/services/*`
 *    singleton already exposes, so the real implementations satisfy
 *    the interface without adapters.
 *
 *  - Slim output shapes (`ProductSummary`, `OrderSummary`, …) that
 *    keep model-facing payloads lean (a `Product` has 30+ fields;
 *    a `ProductSummary` has 11).
 *
 *  - Mapper functions that convert domain / DB shapes into summaries.
 *
 * Nothing in this file touches the network, holds API keys, or
 * imports Supabase. Raw shapes are defined locally so the tool layer
 * is never coupled to auto-generated Supabase types.
 */

import type { Product } from "@/types";

/* ------------------------------------------------------------------ *
 * Sort & filter shapes (mirrors both SortOption & SearchSortOption)
 * ------------------------------------------------------------------ */

export type MarketplaceSortOption =
  | "relevance"
  | "price-low"
  | "price-high"
  | "rating"
  | "popularity"
  | "newest";

export interface MarketplaceSearchFilters {
  category?: string;
  priceMin?: number;
  priceMax?: number;
  minRating?: number;
}

/* ------------------------------------------------------------------ *
 * Raw shapes from services
 * ------------------------------------------------------------------ *
 * Lightweight interfaces mirroring what Supabase returns through the
 * existing service layer. Defined here to avoid any coupling to
 * auto-generated Supabase types.
 * ------------------------------------------------------------------ */

/** Subset of the object shape returned by `orderService.getUserOrders()`. */
export interface RawOrder {
  id: string;
  user_id: string;
  total_amount: number;
  order_status: string;
  payment_status: string;
  shipping_status: string | null;
  shipping_provider: string | null;
  tracking_id: string | null;
  estimated_delivery: string | null;
  created_at: string;
  order_items: RawOrderItem[];
}

/** Subset of an order-item row. */
export interface RawOrderItem {
  id: string;
  product_id: string | null;
  vendor_id: string | null;
  title: string;
  image: string | null;
  price: number;
  quantity: number;
  return_status: string | null;
  return_reason: string | null;
}

/** Subset of a shipment-event row. */
export interface RawShipmentEvent {
  id: string;
  order_id: string;
  status: string;
  description: string | null;
  location: string | null;
  created_at: string;
}

/** Subset of a vendor row (public columns). */
export interface RawVendor {
  id: string;
  user_id: string;
  store_name: string;
  [key: string]: unknown;
}

/** Return shape of `vendorService.getStats()`. */
export interface VendorStats {
  products: number;
  totalSales: number;
  campaigns: number;
}

/** Return shape of `vendorService.getTrustMetrics()`. */
export interface TrustMetrics {
  trustScore: number;
  deliveryRate: number;
  cancellationRate: number;
  returnRate: number;
  reviewRating: number;
  isVerified: boolean;
}

/** Return shape of `analyticsService.getVendorAnalytics()`. */
export interface RawVendorAnalytics {
  productViews: number;
  adImpressions: number;
  adClicks: number;
  conversionRate: string;
  salesGrowth: string;
  purchases: number;
}

/* ------------------------------------------------------------------ *
 * MarketplaceServices — the DI seam
 * ------------------------------------------------------------------ *
 * Each property mirrors a method subset of the corresponding service
 * singleton from `src/services/`. The composition root (future work)
 * wires the real implementations; unit tests provide mocks.
 * ------------------------------------------------------------------ */

export interface MarketplaceServices extends Record<string, unknown> {
  productService: {
    getAll(options?: {
      category?: string;
      search?: string;
      limit?: number;
      sort?: MarketplaceSortOption;
      status?: string;
    }): Promise<Product[]>;
    getCategories(): Promise<string[]>;
    getTrending(limit?: number): Promise<Product[]>;
  };

  searchService: {
    searchProducts(
      query: string,
      filters?: MarketplaceSearchFilters,
      sort?: MarketplaceSortOption,
      limit?: number,
      userState?: string | null,
    ): Promise<Product[]>;
  };

  orderService: {
    getUserOrders(userId: string, limit?: number): Promise<RawOrder[]>;
    getVendorOrderItems(vendorId: string, limit?: number): Promise<RawOrderItem[]>;
    getShipmentEvents(orderId: string): Promise<RawShipmentEvent[]>;
  };

  vendorService: {
    getByUserId(userId: string): Promise<RawVendor | null>;
    getStats(vendorId: string): Promise<VendorStats>;
    getTrustMetrics(vendorId: string): Promise<TrustMetrics>;
  };

  analyticsService: {
    getVendorAnalytics(vendorId: string): Promise<RawVendorAnalytics>;
  };

  aiRecommendationService: {
    getSmartRecommendations(userId: string, limit?: number): Promise<Product[]>;
    getBecauseYouViewed(
      userId: string,
      limit?: number,
    ): Promise<{ contextProductTitle: string; products: Product[] } | null>;
    getPopularInCategory(category: string, limit?: number): Promise<Product[]>;
  };
}

/* ------------------------------------------------------------------ *
 * Slim output shapes
 * ------------------------------------------------------------------ */

/** Model-facing product summary — 11 fields vs. Product's 30+. */
export interface ProductSummary {
  id: string;
  title: string;
  slug: string;
  category: string;
  price: number;
  discountPrice: number | null;
  rating: number;
  reviewCount: number;
  vendorName: string;
  inStock: boolean;
  tags: string[];
}

/** Model-facing order-item summary. */
export interface OrderItemSummary {
  title: string;
  price: number;
  quantity: number;
  productId: string | null;
  vendorId: string | null;
  returnStatus: string | null;
}

/** Model-facing shipment-event summary. */
export interface ShipmentEventSummary {
  status: string;
  description: string | null;
  location: string | null;
  createdAt: string;
}

/** Model-facing order summary with nested items and optional shipment events. */
export interface OrderSummary {
  id: string;
  totalAmount: number;
  orderStatus: string;
  paymentStatus: string;
  shippingStatus: string | null;
  trackingId: string | null;
  estimatedDelivery: string | null;
  createdAt: string;
  items: OrderItemSummary[];
  shipmentEvents?: ShipmentEventSummary[];
}

/* ------------------------------------------------------------------ *
 * Mapper functions
 * ------------------------------------------------------------------ */

/** Convert a full `Product` to a lean `ProductSummary`. */
export function toProductSummary(p: Product): ProductSummary {
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    category: p.category,
    price: p.price,
    discountPrice: p.discountPrice ?? null,
    rating: p.rating,
    reviewCount: p.reviewCount,
    vendorName: p.vendorName,
    inStock: p.stock - p.reservedStock > 0,
    tags: p.tags ?? [],
  };
}

/** Convert a raw order row to a lean `OrderSummary`. */
export function toOrderSummary(raw: RawOrder): OrderSummary {
  return {
    id: raw.id,
    totalAmount: raw.total_amount,
    orderStatus: raw.order_status,
    paymentStatus: raw.payment_status,
    shippingStatus: raw.shipping_status,
    trackingId: raw.tracking_id,
    estimatedDelivery: raw.estimated_delivery,
    createdAt: raw.created_at,
    items: (raw.order_items ?? []).map(toOrderItemSummary),
  };
}

/** Convert a raw order-item row to a lean `OrderItemSummary`. */
export function toOrderItemSummary(raw: RawOrderItem): OrderItemSummary {
  return {
    title: raw.title,
    price: raw.price,
    quantity: raw.quantity,
    productId: raw.product_id,
    vendorId: raw.vendor_id,
    returnStatus: raw.return_status,
  };
}

/** Convert a raw shipment-event row to a lean `ShipmentEventSummary`. */
export function toShipmentEventSummary(raw: RawShipmentEvent): ShipmentEventSummary {
  return {
    status: raw.status,
    description: raw.description,
    location: raw.location,
    createdAt: raw.created_at,
  };
}

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

/** Clamp a number to [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
