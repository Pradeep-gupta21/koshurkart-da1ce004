import { IPaymentService } from '../../interfaces/IPaymentService';
import { Result, CommerceError } from '../../types/Result';
import { Payment } from '@/types';
import { supabase } from '../../../../integrations/supabase/client';

export class SupabasePaymentService implements IPaymentService {
  async createPaymentIntent(orderId: string, amount: number, paymentMethod: Payment['paymentMethod']): Promise<Result<Payment, CommerceError>> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      
      if (!userId) {
        return {
          success: false,
          error: { code: 'unauthorized', message: 'User not authenticated' }
        };
      }

      const { data, error } = await supabase
        .from('payments')
        .insert({
          order_id: orderId,
          user_id: userId,
          amount,
          payment_method: paymentMethod,
          payment_status: 'pending',
          platform_commission: 0,
          commission_percentage: 0,
          vendor_earnings: amount
        })
        .select('*')
        .single();

      if (error) {
        return {
          success: false,
          error: { code: 'database_error', message: error.message }
        };
      }

      return {
        success: true,
        data: this.mapToPayment(data)
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' }
      };
    }
  }

  async confirmPayment(paymentId: string, transactionId: string): Promise<Result<Payment, CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('payments')
        .update({
          payment_status: 'success',
          transaction_id: transactionId
        })
        .eq('id', paymentId)
        .select('*')
        .single();

      if (error) {
        return {
          success: false,
          error: { code: 'database_error', message: error.message }
        };
      }

      return {
        success: true,
        data: this.mapToPayment(data)
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' }
      };
    }
  }

  async getPaymentStatus(paymentId: string): Promise<Result<Payment, CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('id', paymentId)
        .single();

      if (error) {
        return {
          success: false,
          error: { code: 'database_error', message: error.message }
        };
      }

      return {
        success: true,
        data: this.mapToPayment(data)
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' }
      };
    }
  }

  async refundPayment(paymentId: string): Promise<Result<Payment, CommerceError>> {
    try {
      const { data, error } = await supabase
        .from('payments')
        .update({
          payment_status: 'refunded'
        })
        .eq('id', paymentId)
        .select('*')
        .single();

      if (error) {
        return {
          success: false,
          error: { code: 'database_error', message: error.message }
        };
      }

      return {
        success: true,
        data: this.mapToPayment(data)
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'unknown_error', message: err.message || 'An unknown error occurred' }
      };
    }
  }

  private mapToPayment(data: any): Payment {
    return {
      id: data.id,
      userId: data.user_id,
      orderId: data.order_id,
      amount: data.amount,
      paymentMethod: data.payment_method,
      paymentProvider: data.payment_provider,
      transactionId: data.transaction_id,
      paymentStatus: data.payment_status,
      platformCommission: data.platform_commission,
      commissionPercentage: data.commission_percentage,
      vendorEarnings: data.vendor_earnings,
      upiId: data.upi_id,
      qrCodeUrl: data.qr_code_url,
      paymentProof: data.payment_proof,
      razorpayOrderId: data.razorpay_order_id,
      razorpayPaymentId: data.razorpay_payment_id,
      razorpaySignature: data.razorpay_signature,
      createdAt: data.created_at
    };
  }
}
