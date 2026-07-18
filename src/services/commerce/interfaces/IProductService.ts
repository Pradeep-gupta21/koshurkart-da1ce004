import { Result, CommerceError } from '../types/Result';
import { Product } from '@/types';

export type ProductSortOption = 'newest' | 'price-low' | 'price-high' | 'rating' | 'popularity' | 'relevance';

export interface IProductService {
  getProductById(id: string): Promise<Result<Product, CommerceError>>;
  getProductsByIds(ids: string[]): Promise<Result<Product[], CommerceError>>;
  searchProducts(query: string, filters?: any): Promise<Result<Product[], CommerceError>>;
  getProductsByCategory(categoryId: string): Promise<Result<Product[], CommerceError>>;

  getAll(options?: {
    category?: string;
    search?: string;
    limit?: number;
    sort?: ProductSortOption;
    status?: string;
    sponsored?: boolean;
  }): Promise<Result<Product[], CommerceError>>;
  
  getBySlug(slug: string): Promise<Result<Product, CommerceError>>;
  
  getByVendor(vendorId: string, limit?: number): Promise<Result<Product[], CommerceError>>;
  
  getCategories(): Promise<Result<string[], CommerceError>>;
  
  create(product: {
    vendor_id: string;
    title: string;
    slug: string;
    description: string;
    price: number;
    discount_price: number | null;
    stock: number;
    low_stock_threshold?: number;
    category: string;
    images: string[];
    status?: string;
  }): Promise<Result<Product, CommerceError>>;
  
  update(id: string, updates: Record<string, unknown>): Promise<Result<Product, CommerceError>>;
  
  remove(id: string): Promise<Result<void, CommerceError>>;
  
  uploadImage(file: File, userId: string): Promise<Result<string, CommerceError>>;
  
  getVendors(): Promise<Result<any[], CommerceError>>;
  
  getRanked(options?: {
    category?: string;
    search?: string;
    limit?: number;
    userState?: string | null;
  }): Promise<Result<Product[], CommerceError>>;
  
  getTrending(limit?: number): Promise<Result<Product[], CommerceError>>;
}
