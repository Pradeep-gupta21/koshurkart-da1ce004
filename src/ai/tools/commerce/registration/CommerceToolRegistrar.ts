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
import { SearchProductsTool } from '../product/SearchProductsTool';
import { ProductRecommendationTool } from '../product/ProductRecommendationTool';
import { RecommendForUserTool } from '../product/RecommendForUserTool';
import { GetProductTool } from '../product/GetProductTool';
import { GetFeaturedProductsTool } from '../product/GetFeaturedProductsTool';
import { GetLatestProductsTool } from '../product/GetLatestProductsTool';
import { SearchCategoriesTool } from '../product/SearchCategoriesTool';
import { SearchVendorsTool } from '../product/SearchVendorsTool';
import { GetVendorTool } from '../product/GetVendorTool';
import { CompareProductsTool } from '../product/CompareProductsTool';
import { GetSimilarProductsTool } from '../product/GetSimilarProductsTool';
import { ProductKnowledgeTool } from '../product/ProductKnowledgeTool';
import { ReviewProductsTool } from '../product/ReviewProductsTool';
// Phase 4A — Cart
import { AddToCartTool } from '../cart/AddToCartTool';
import { RemoveFromCartTool } from '../cart/RemoveFromCartTool';
import { UpdateCartQuantityTool } from '../cart/UpdateCartQuantityTool';
import { GetCartTool } from '../cart/GetCartTool';
import { ClearCartTool } from '../cart/ClearCartTool';
// Phase 4B — Wishlist
import { AddToWishlistTool } from '../wishlist/AddToWishlistTool';
import { RemoveFromWishlistTool } from '../wishlist/RemoveFromWishlistTool';
import { GetWishlistTool } from '../wishlist/GetWishlistTool';
import { ClearWishlistTool } from '../wishlist/ClearWishlistTool';
// Phase 5 - Order Management
import { GetOrdersTool } from '../order/GetOrdersTool';
import { GetOrderTool } from '../order/GetOrderTool';
import { TrackOrderTool } from '../order/TrackOrderTool';
import { CancelOrderTool } from '../order/CancelOrderTool';
// Phase 6 - Recently Viewed
import { AddRecentlyViewedTool } from '../recently-viewed/AddRecentlyViewedTool';
import { GetRecentlyViewedTool } from '../recently-viewed/GetRecentlyViewedTool';
import { ClearRecentlyViewedTool } from '../recently-viewed/ClearRecentlyViewedTool';
// Other
import { CustomerTool } from '../customer/CustomerTool';
// Phase 7 - Coupons & Promotions
import { GetAvailableCouponsTool } from '../coupons/GetAvailableCouponsTool';
import { ApplyCouponTool } from '../coupons/ApplyCouponTool';
import { RecommendBestCouponTool } from '../coupons/RecommendBestCouponTool';
// Phase 8 - Shipping
import { GetShippingOptionsTool } from '../shipping/GetShippingOptionsTool';
import { EstimateDeliveryTool } from '../shipping/EstimateDeliveryTool';
import { TrackShipmentTool } from '../shipping/TrackShipmentTool';
// Phase 9 - Returns
import { GetReturnPolicyTool } from '../returns/GetReturnPolicyTool';
import { CreateReturnRequestTool } from '../returns/CreateReturnRequestTool';
import { TrackReturnTool } from '../returns/TrackReturnTool';
import { EstimateRefundTool } from '../returns/EstimateRefundTool';
// Phase 10 - Checkout
import { ValidateCheckoutTool } from '../checkout/ValidateCheckoutTool';
import { CheckoutSummaryTool } from '../checkout/CheckoutSummaryTool';
import { SuggestPaymentMethodTool } from '../checkout/SuggestPaymentMethodTool';
import { PreCheckoutAssistantTool } from '../checkout/PreCheckoutAssistantTool';
// Phase 11 - Customer Memory
import { RememberPreferenceTool } from '../memory/RememberPreferenceTool';
import { GetCustomerPreferencesTool } from '../memory/GetCustomerPreferencesTool';
import { ForgetPreferenceTool } from '../memory/ForgetPreferenceTool';
import { UpdatePreferenceTool } from '../memory/UpdatePreferenceTool';
import { ShoppingConciergeTool } from '../concierge/ShoppingConciergeTool';
import { AnyTool } from '../../types';

export class CommerceToolRegistrar {
  /**
   * Automatically registers all commerce tools into the provided ToolRegistry.
   * Each tool self-describes its schema and audience — no additional wiring required.
   */
  static register(registry: ToolRegistry): void {
    const tools: AnyTool[] = [
      // Product discovery (Phase 3)
      new SearchProductsTool() as unknown as AnyTool,
      new ProductRecommendationTool() as unknown as AnyTool,
      new RecommendForUserTool() as unknown as AnyTool,
      new GetProductTool() as unknown as AnyTool,
      new GetFeaturedProductsTool() as unknown as AnyTool,
      new GetLatestProductsTool() as unknown as AnyTool,
      new SearchCategoriesTool() as unknown as AnyTool,
      new SearchVendorsTool() as unknown as AnyTool,
      new GetVendorTool() as unknown as AnyTool,
      new CompareProductsTool() as unknown as AnyTool,
      new GetSimilarProductsTool() as unknown as AnyTool,
      new ProductKnowledgeTool() as unknown as AnyTool,
      new ReviewProductsTool() as unknown as AnyTool,
      // Cart management (Phase 4A)
      new AddToCartTool() as unknown as AnyTool,
      new RemoveFromCartTool() as unknown as AnyTool,
      new UpdateCartQuantityTool() as unknown as AnyTool,
      new GetCartTool() as unknown as AnyTool,
      new ClearCartTool() as unknown as AnyTool,
      // Wishlist management (Phase 4B)
      new AddToWishlistTool() as unknown as AnyTool,
      new RemoveFromWishlistTool() as unknown as AnyTool,
      new GetWishlistTool() as unknown as AnyTool,
      new ClearWishlistTool() as unknown as AnyTool,
      // Order Management (Phase 5)
      new GetOrdersTool() as unknown as AnyTool,
      new GetOrderTool() as unknown as AnyTool,
      new TrackOrderTool() as unknown as AnyTool,
      new CancelOrderTool() as unknown as AnyTool,
      // Recently Viewed (Phase 6)
      new AddRecentlyViewedTool() as unknown as AnyTool,
      new GetRecentlyViewedTool() as unknown as AnyTool,
      new ClearRecentlyViewedTool() as unknown as AnyTool,
      // Other
      new CustomerTool() as unknown as AnyTool,
      // Coupons & Promotions (Phase 7)
      new GetAvailableCouponsTool() as unknown as AnyTool,
      new ApplyCouponTool() as unknown as AnyTool,
      new RecommendBestCouponTool() as unknown as AnyTool,
      // Shipping (Phase 8)
      new GetShippingOptionsTool() as unknown as AnyTool,
      new EstimateDeliveryTool() as unknown as AnyTool,
      new TrackShipmentTool() as unknown as AnyTool,
      // Returns & Refunds (Phase 9)
      new GetReturnPolicyTool() as unknown as AnyTool,
      new CreateReturnRequestTool() as unknown as AnyTool,
      new TrackReturnTool() as unknown as AnyTool,
      new EstimateRefundTool() as unknown as AnyTool,
      // Checkout (Phase 10)
      new ValidateCheckoutTool() as unknown as AnyTool,
      new CheckoutSummaryTool() as unknown as AnyTool,
      new SuggestPaymentMethodTool() as unknown as AnyTool,
      new PreCheckoutAssistantTool() as unknown as AnyTool,
      // Customer Memory (Phase 11)
      new RememberPreferenceTool() as unknown as AnyTool,
      new GetCustomerPreferencesTool() as unknown as AnyTool,
      new ForgetPreferenceTool() as unknown as AnyTool,
      new UpdatePreferenceTool() as unknown as AnyTool,
      // Concierge (Phase 12)
      new ShoppingConciergeTool() as unknown as AnyTool,
    ];

    registry.registerMany(tools);
  }
}
