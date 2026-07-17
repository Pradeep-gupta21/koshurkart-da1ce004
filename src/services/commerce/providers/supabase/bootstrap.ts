import { Container } from '../../di/Container';
import { SupabaseCommerceProvider } from './SupabaseCommerceProvider';

/**
 * Bootstraps the Supabase commerce provider by instantiating its services
 * and injecting them into the shared DI container.
 */
export function bootstrapSupabaseProvider(): void {
  const provider = new SupabaseCommerceProvider();
  
  Container.register('CommerceProvider', provider);
  Container.register('ProductService', provider.getProductService());
  Container.register('CartService', provider.getCartService());
  Container.register('WishlistService', provider.getWishlistService());
  Container.register('OrderService', provider.getOrderService());
  Container.register('CustomerService', provider.getCustomerService());
}
