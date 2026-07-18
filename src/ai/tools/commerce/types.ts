/**
 * KoshurKart — Commerce Tools Types
 * =================================================================
 * Shared interfaces and dependency injection definitions for the
 * Commerce tools layer.
 */
import type { ToolContext } from "../types";

export interface IProductService {
  // Placeholder for future product operations
  searchProducts(query: string, options?: { category?: string; maxPrice?: number; limit?: number }): Promise<any[]>;
}

export interface ICartService {
  // Placeholder for future cart operations
  getCart(customerId: string): Promise<any>;
  addToCart(customerId: string, productId: string, quantity: number): Promise<any>;
  removeFromCart(customerId: string, productId: string): Promise<any>;
  updateQuantity(customerId: string, productId: string, quantity: number): Promise<any>;
  clearCart(customerId: string): Promise<void>;
}

export interface IWishlistService {
  // Placeholder for future wishlist operations
  getWishlist(): Promise<any>;
  addItem(productId: string): Promise<any>;
  removeItem(productId: string): Promise<any>;
  checkItem(productId: string): Promise<boolean>;
}

export interface IOrderService {
  // Placeholder for future order operations
  getOrder(orderId: string): Promise<any>;
  listOrders(options?: { limit?: number; offset?: number }): Promise<any[]>;
  trackOrder(orderId: string): Promise<any>;
  cancelOrder(orderId: string, reason?: string): Promise<any>;
}

export interface ICustomerService {
  // Placeholder for future customer profile operations
  getProfile(): Promise<any>;
  updateProfile(profileData: any): Promise<any>;
  getAddresses(): Promise<any[]>;
  getPreferences(): Promise<any>;
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
