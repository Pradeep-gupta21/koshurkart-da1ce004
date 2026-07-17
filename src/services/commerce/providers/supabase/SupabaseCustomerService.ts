import { ICustomerService } from '../../../interfaces/ICustomerService';
import { Result, CommerceError } from '../../../types/Result';
import { supabase } from '../../../../integrations/supabase/client';

export class SupabaseCustomerService implements ICustomerService {
  async getCustomer(id: string): Promise<Result<any, CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        return { success: false, error: { code: 'database_error', message: error.message } };
      }

      if (!data) {
        return { success: false, error: { code: 'not_found', message: 'Customer not found' } };
      }

      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async updateCustomer(id: string, data: any): Promise<Result<any, CommerceError>> {
    try {
      const { data: updatedData, error } = await supabase
        .from('profiles')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return { success: false, error: { code: 'database_error', message: error.message } };
      }

      return { success: true, data: updatedData };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }

  async createCustomer(data: any): Promise<Result<any, CommerceError>> {
    try {
      const { data: createdData, error } = await supabase
        .from('profiles')
        .insert(data)
        .select()
        .single();

      if (error) {
        return { success: false, error: { code: 'database_error', message: error.message } };
      }

      return { success: true, data: createdData };
    } catch (err: any) {
      return { success: false, error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' } };
    }
  }
}
