import { IProductService } from '../../../interfaces/IProductService';
import { Result, CommerceError } from '../../../types/Result';

export class SupabaseProductService implements IProductService {
  async getProductById(id: string): Promise<Result<any, CommerceError>> {
    return { success: false, error: { code: 'not_implemented', message: 'Not connected to Supabase yet' } };
  }

  async searchProducts(query: string, filters?: any): Promise<Result<any[], CommerceError>> {
    return { success: false, error: { code: 'not_implemented', message: 'Not connected to Supabase yet' } };
  }

  async getProductsByCategory(categoryId: string): Promise<Result<any[], CommerceError>> {
    return { success: false, error: { code: 'not_implemented', message: 'Not connected to Supabase yet' } };
  }
}
