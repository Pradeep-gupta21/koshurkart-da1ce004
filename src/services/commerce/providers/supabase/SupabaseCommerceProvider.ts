import { ICommerceProvider } from '../ICommerceProvider';
import { SupabaseProductService } from './SupabaseProductService';
import { SupabaseCartService } from './SupabaseCartService';
import { SupabaseWishlistService } from './SupabaseWishlistService';
import { SupabaseOrderService } from './SupabaseOrderService';
import { SupabaseCustomerService } from './SupabaseCustomerService';
import { SupabaseInventoryService } from './SupabaseInventoryService';
import { SupabaseReviewService } from './SupabaseReviewService';
import { SupabaseSearchService } from './SupabaseSearchService';
import { SupabaseRecommendationService } from './SupabaseRecommendationService';
import { SupabasePaymentService } from './SupabasePaymentService';
import { SupabaseShippingService } from './SupabaseShippingService';
import { SupabaseNotificationService } from './SupabaseNotificationService';
import { SupabaseAnalyticsService } from './SupabaseAnalyticsService';

export class SupabaseCommerceProvider implements ICommerceProvider {
  get name(): string {
    return 'supabase';
  }

  async initialize(): Promise<void> {
    // Initialization logic for the Supabase Provider (if any)
    return Promise.resolve();
  }

  getProductService(): SupabaseProductService {
    return new SupabaseProductService();
  }

  getCartService(): SupabaseCartService {
    return new SupabaseCartService();
  }

  getWishlistService(): SupabaseWishlistService {
    return new SupabaseWishlistService();
  }

  getOrderService(): SupabaseOrderService {
    return new SupabaseOrderService();
  }

  getCustomerService(): SupabaseCustomerService {
    return new SupabaseCustomerService();
  }

  getInventoryService(): SupabaseInventoryService {
    return new SupabaseInventoryService();
  }

  getReviewService(): SupabaseReviewService {
    return new SupabaseReviewService();
  }

  getSearchService(): SupabaseSearchService {
    return new SupabaseSearchService();
  }

  getRecommendationService(): SupabaseRecommendationService {
    return new SupabaseRecommendationService();
  }

  getPaymentService(): SupabasePaymentService {
    return new SupabasePaymentService();
  }

  getShippingService(): SupabaseShippingService {
    return new SupabaseShippingService();
  }

  getNotificationService(): SupabaseNotificationService {
    return new SupabaseNotificationService();
  }

  getAnalyticsService(): SupabaseAnalyticsService {
    return new SupabaseAnalyticsService();
  }
}
