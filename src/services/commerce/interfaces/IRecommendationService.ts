import { Result, CommerceError } from '../types/Result';
import { Product } from '@/types';

export interface IRecommendationService {
  // Original basic recommendations
  getRecommendedProducts(productId: string): Promise<Result<Product[], CommerceError>>;
  getRelatedProducts(productId: string): Promise<Result<Product[], CommerceError>>;
  getTrendingProducts(): Promise<Result<Product[], CommerceError>>;
  getPopularProducts(): Promise<Result<Product[], CommerceError>>;
  getPersonalizedRecommendations(customerId: string): Promise<Result<Product[], CommerceError>>;

  // Advanced recommendations (migrated)
  getRecentlyViewed(userId: string, limit?: number): Promise<Result<Product[], CommerceError>>;
  getProductsPreservingOrder(ids: string[]): Promise<Result<Product[], CommerceError>>;
  getSmartRecommendations(userId: string, limit?: number): Promise<Result<Product[], CommerceError>>;
  getBecauseYouViewed(userId: string, limit?: number): Promise<Result<{contextProductTitle: string; products: Product[]} | null, CommerceError>>;
  getPopularInCategory(category: string, limit?: number): Promise<Result<Product[], CommerceError>>;
  getScoredSimilarProducts(productId: string, limit?: number): Promise<Result<Product[], CommerceError>>;
  getFrequentlyBoughtTogether(productId: string, limit?: number): Promise<Result<Product[], CommerceError>>;
}
