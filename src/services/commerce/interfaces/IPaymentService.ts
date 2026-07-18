import { Result, CommerceError } from '../types/Result';
import { Payment } from '@/types';

export interface IPaymentService {
  createPaymentIntent(orderId: string, amount: number, paymentMethod: Payment['paymentMethod']): Promise<Result<Payment, CommerceError>>;
  confirmPayment(paymentId: string, transactionId: string): Promise<Result<Payment, CommerceError>>;
  getPaymentStatus(paymentId: string): Promise<Result<Payment, CommerceError>>;
  refundPayment(paymentId: string): Promise<Result<Payment, CommerceError>>;
}
