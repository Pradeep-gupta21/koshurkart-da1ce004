import { ICommerceProvider } from '../ICommerceProvider';
import { SupabaseProductService } from './SupabaseProductService';
import { SupabaseCartService } from './SupabaseCartService';
import { SupabaseWishlistService } from './SupabaseWishlistService';
import { SupabaseOrderService } from './SupabaseOrderService';
import { SupabaseCustomerService } from './SupabaseCustomerService';
import { SupabaseInventoryService } from './SupabaseInventoryService';
import { SupabaseReviewService } from './SupabaseReviewService';
import { SupabaseSearchService } from './SupabaseSearchService';

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
}
