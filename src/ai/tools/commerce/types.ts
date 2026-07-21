/**
 * KoshurKart — Commerce Tools Types
 * =================================================================
 * Shared interfaces and dependency injection definitions for the
 * Commerce tools layer.
 */
import type { ToolContext } from "../types";

export interface IProductService {
  searchProducts(query: string, options?: { category?: string; maxPrice?: number; limit?: number }): Promise<any>;
  getProductById(id: string): Promise<any>;
  getBySlug(slug: string): Promise<any>;
  getTrending(limit?: number): Promise<any>;
  getAll(options?: any): Promise<any>;
  getCategories(): Promise<any>;
}

export interface IVendorService {
  getById(id: string): Promise<any>;
  // Additional vendor methods if needed
}

export interface ICartService {
  getCart(customerId: string): Promise<{ success: boolean; data?: any; error?: { code: string; message: string } }>;
  addToCart(customerId: string, productId: string, quantity: number): Promise<{ success: boolean; data?: any; error?: { code: string; message: string } }>;
  removeFromCart(customerId: string, productId: string): Promise<{ success: boolean; data?: any; error?: { code: string; message: string } }>;
  updateQuantity(customerId: string, productId: string, quantity: number): Promise<{ success: boolean; data?: any; error?: { code: string; message: string } }>;
  clearCart(customerId: string): Promise<{ success: boolean; data?: void; error?: { code: string; message: string } }>;
}

export interface IWishlistService {
  getWishlist(userId: string): Promise<{ success: boolean; data?: any; error?: { code: string; message: string } }>;
  addToWishlist(userId: string, productId: string): Promise<{ success: boolean; data?: any; error?: { code: string; message: string } }>;
  removeFromWishlist(userId: string, productId: string): Promise<{ success: boolean; data?: any; error?: { code: string; message: string } }>;
  isInWishlist(userId: string, productId: string): Promise<{ success: boolean; data?: boolean; error?: { code: string; message: string } }>;
  clearWishlist(userId: string): Promise<{ success: boolean; data?: void; error?: { code: string; message: string } }>;
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
  vendor?: IVendorService;
  cart?: ICartService;
  wishlist?: IWishlistService;
  order?: IOrderService;
  customer?: ICustomerService;
}

export type CommerceToolContext = ToolContext<CommerceServices>;
