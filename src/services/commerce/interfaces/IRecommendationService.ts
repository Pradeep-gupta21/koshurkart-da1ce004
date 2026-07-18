import { Result, CommerceError } from '../types/Result';
import { Product } from '@/types';

export interface IRecommendationService {
  getRecommendedProducts(productId: string): Promise<Result<Product[], CommerceError>>;
  getRelatedProducts(productId: string): Promise<Result<Product[], CommerceError>>;
  getTrendingProducts(): Promise<Result<Product[], CommerceError>>;
  getPopularProducts(): Promise<Result<Product[], CommerceError>>;
  getPersonalizedRecommendations(customerId: string): Promise<Result<Product[], CommerceError>>;
}
