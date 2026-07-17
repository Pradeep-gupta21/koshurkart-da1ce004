import { IWishlistService } from '../../../interfaces/IWishlistService';
import { Result, CommerceError } from '../../../types/Result';

export class SupabaseWishlistService implements IWishlistService {
  async getWishlist(customerId: string): Promise<Result<any, CommerceError>> {
    return { success: false, error: { code: 'not_implemented', message: 'Not connected to Supabase yet' } };
  }

  async addToWishlist(customerId: string, productId: string): Promise<Result<any, CommerceError>> {
    return { success: false, error: { code: 'not_implemented', message: 'Not connected to Supabase yet' } };
  }

  async removeFromWishlist(customerId: string, productId: string): Promise<Result<any, CommerceError>> {
    return { success: false, error: { code: 'not_implemented', message: 'Not connected to Supabase yet' } };
  }
}
