import { ICommerceProvider } from '../ICommerceProvider';
import { SupabaseProductService } from './SupabaseProductService';
import { SupabaseCartService } from './SupabaseCartService';
import { SupabaseWishlistService } from './SupabaseWishlistService';
import { SupabaseOrderService } from './SupabaseOrderService';
import { SupabaseCustomerService } from './SupabaseCustomerService';

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
}
