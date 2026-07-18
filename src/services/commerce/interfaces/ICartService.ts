import { Result, CommerceError } from '../types/Result';

export interface ICartService {
  getCart(customerId: string): Promise<Result<any, CommerceError>>;
  addToCart(customerId: string, productId: string, quantity: number): Promise<Result<any, CommerceError>>;
  removeFromCart(customerId: string, productId: string): Promise<Result<any, CommerceError>>;
  updateQuantity(customerId: string, productId: string, quantity: number): Promise<Result<any, CommerceError>>;
  clearCart(customerId: string): Promise<Result<void, CommerceError>>;
}
