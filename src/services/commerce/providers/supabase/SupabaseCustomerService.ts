import { ICustomerService } from '../../../interfaces/ICustomerService';
import { Result, CommerceError } from '../../../types/Result';

export class SupabaseCustomerService implements ICustomerService {
  async getCustomer(id: string): Promise<Result<any, CommerceError>> {
    return { success: false, error: { code: 'not_implemented', message: 'Not connected to Supabase yet' } };
  }

  async updateCustomer(id: string, data: any): Promise<Result<any, CommerceError>> {
    return { success: false, error: { code: 'not_implemented', message: 'Not connected to Supabase yet' } };
  }

  async createCustomer(data: any): Promise<Result<any, CommerceError>> {
    return { success: false, error: { code: 'not_implemented', message: 'Not connected to Supabase yet' } };
  }
}
