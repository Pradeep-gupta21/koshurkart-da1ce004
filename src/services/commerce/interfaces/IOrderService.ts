import { Result, CommerceError } from '../types/Result';

export interface IOrderService {
  createOrder(customerId: string, cartId: string, paymentDetails: any): Promise<Result<any, CommerceError>>;
  getOrder(orderId: string): Promise<Result<any, CommerceError>>;
  getCustomerOrders(customerId: string): Promise<Result<any[], CommerceError>>;
  cancelOrder(orderId: string): Promise<Result<any, CommerceError>>;
}
