import { ICartService } from '../../../interfaces/ICartService';
import { Result, CommerceError } from '../../../types/Result';

export class SupabaseCartService implements ICartService {
  async getCart(customerId: string): Promise<Result<any, CommerceError>> {
    return { success: false, error: { code: 'not_implemented', message: 'Not connected to Supabase yet' } };
  }

  async addToCart(customerId: string, productId: string, quantity: number): Promise<Result<any, CommerceError>> {
    return { success: false, error: { code: 'not_implemented', message: 'Not connected to Supabase yet' } };
  }

  async removeFromCart(customerId: string, productId: string): Promise<Result<any, CommerceError>> {
    return { success: false, error: { code: 'not_implemented', message: 'Not connected to Supabase yet' } };
  }

  async clearCart(customerId: string): Promise<Result<void, CommerceError>> {
    return { success: false, error: { code: 'not_implemented', message: 'Not connected to Supabase yet' } };
  }
}
