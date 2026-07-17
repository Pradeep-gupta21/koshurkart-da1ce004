import { Result, CommerceError } from '../types/Result';

export interface IWishlistService {
  getWishlist(customerId: string): Promise<Result<any, CommerceError>>;
  addToWishlist(customerId: string, productId: string): Promise<Result<any, CommerceError>>;
  removeFromWishlist(customerId: string, productId: string): Promise<Result<any, CommerceError>>;
  isInWishlist(customerId: string, productId: string): Promise<Result<boolean, CommerceError>>;
  clearWishlist(customerId: string): Promise<Result<void, CommerceError>>;
}
