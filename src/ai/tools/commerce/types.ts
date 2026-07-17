/**
 * KoshurKart — Commerce Tools Types
 * =================================================================
 * Shared interfaces and dependency injection definitions for the
 * Commerce tools layer.
 */
import type { ToolContext } from "../types";

export interface IProductService {
  // Placeholder for future product operations
}

export interface ICartService {
  // Placeholder for future cart operations
}

export interface IWishlistService {
  // Placeholder for future wishlist operations
}

export interface IOrderService {
  // Placeholder for future order operations
}

export interface ICustomerService {
  // Placeholder for future customer profile operations
}

/**
 * The Dependency Injection bag for commerce tools.
 * Tools will retrieve these services from the ToolContext.
 */
export interface CommerceServices extends Record<string, unknown> {
  product?: IProductService;
  cart?: ICartService;
  wishlist?: IWishlistService;
  order?: IOrderService;
  customer?: ICustomerService;
}

export type CommerceToolContext = ToolContext<CommerceServices>;
