import { IOrderService } from '../../../interfaces/IOrderService';
import { Result, CommerceError } from '../../../types/Result';

export class SupabaseOrderService implements IOrderService {
  async createOrder(customerId: string, cartId: string, paymentDetails: any): Promise<Result<any, CommerceError>> {
    return { success: false, error: { code: 'not_implemented', message: 'Not connected to Supabase yet' } };
  }

  async getOrder(orderId: string): Promise<Result<any, CommerceError>> {
    return { success: false, error: { code: 'not_implemented', message: 'Not connected to Supabase yet' } };
  }

  async getCustomerOrders(customerId: string): Promise<Result<any[], CommerceError>> {
    return { success: false, error: { code: 'not_implemented', message: 'Not connected to Supabase yet' } };
  }

  async cancelOrder(orderId: string): Promise<Result<any, CommerceError>> {
    return { success: false, error: { code: 'not_implemented', message: 'Not connected to Supabase yet' } };
  }
}
