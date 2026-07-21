/**
 * KoshurKart — CommerceToolRegistrar
 * =================================================================
 * Registers all commerce tools into the provided ToolRegistry.
 * Adding a tool here is the only wiring step required — no other
 * file needs to be touched for registration.
 *
 * Tool inventory (by phase):
 *  Phase 3 — Product discovery
 *    product_search, get_product, get_featured_products,
 *    get_latest_products, search_categories, search_vendors,
 *    get_vendor, compare_products, get_similar_products
 *
 *  Phase 4A — Cart management (customer-scoped)
 *    add_to_cart, remove_from_cart, update_cart_quantity, get_cart
 *
 *  Phase 4B — Wishlist management (customer-scoped)
 *    add_to_wishlist, remove_from_wishlist, get_wishlist
 *
 *  Other
 *    order, customer
 */

import { ToolRegistry } from '../../registry';
import { ProductSearchTool } from '../product/ProductSearchTool';
import { GetProductTool } from '../product/GetProductTool';
import { GetFeaturedProductsTool } from '../product/GetFeaturedProductsTool';
import { GetLatestProductsTool } from '../product/GetLatestProductsTool';
import { SearchCategoriesTool } from '../product/SearchCategoriesTool';
import { SearchVendorsTool } from '../product/SearchVendorsTool';
import { GetVendorTool } from '../product/GetVendorTool';
import { CompareProductsTool } from '../product/CompareProductsTool';
import { GetSimilarProductsTool } from '../product/GetSimilarProductsTool';
// Phase 4A — Cart
import { AddToCartTool } from '../cart/AddToCartTool';
import { RemoveFromCartTool } from '../cart/RemoveFromCartTool';
import { UpdateCartQuantityTool } from '../cart/UpdateCartQuantityTool';
import { GetCartTool } from '../cart/GetCartTool';
// Phase 4B — Wishlist
import { AddToWishlistTool } from '../wishlist/AddToWishlistTool';
import { RemoveFromWishlistTool } from '../wishlist/RemoveFromWishlistTool';
import { GetWishlistTool } from '../wishlist/GetWishlistTool';
// Other
import { OrderTool } from '../order/OrderTool';
import { CustomerTool } from '../customer/CustomerTool';
import { AnyTool } from '../../types';

export class CommerceToolRegistrar {
  /**
   * Automatically registers all commerce tools into the provided ToolRegistry.
   * Each tool self-describes its schema and audience — no additional wiring required.
   */
  static register(registry: ToolRegistry): void {
    const tools: AnyTool[] = [
      // Product discovery (Phase 3)
      new ProductSearchTool() as unknown as AnyTool,
      new GetProductTool() as unknown as AnyTool,
      new GetFeaturedProductsTool() as unknown as AnyTool,
      new GetLatestProductsTool() as unknown as AnyTool,
      new SearchCategoriesTool() as unknown as AnyTool,
      new SearchVendorsTool() as unknown as AnyTool,
      new GetVendorTool() as unknown as AnyTool,
      new CompareProductsTool() as unknown as AnyTool,
      new GetSimilarProductsTool() as unknown as AnyTool,
      // Cart management (Phase 4A)
      new AddToCartTool() as unknown as AnyTool,
      new RemoveFromCartTool() as unknown as AnyTool,
      new UpdateCartQuantityTool() as unknown as AnyTool,
      new GetCartTool() as unknown as AnyTool,
      // Wishlist management (Phase 4B)
      new AddToWishlistTool() as unknown as AnyTool,
      new RemoveFromWishlistTool() as unknown as AnyTool,
      new GetWishlistTool() as unknown as AnyTool,
      // Other
      new OrderTool() as unknown as AnyTool,
      new CustomerTool() as unknown as AnyTool,
    ];

    registry.registerMany(tools);
  }
}
