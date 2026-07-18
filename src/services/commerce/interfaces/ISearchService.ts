import { Result, CommerceError } from '../types/Result';
import { Product } from '@/types';

export interface SearchFilters {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  vendorId?: string;
  [key: string]: any;
}

export interface SearchOptions {
  filters?: SearchFilters;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ISearchService {
  searchProducts(query: string, options?: SearchOptions): Promise<Result<PaginatedResult<Product>, CommerceError>>;
}
