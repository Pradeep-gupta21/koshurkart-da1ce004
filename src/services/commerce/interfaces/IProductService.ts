import { Result, CommerceError } from '../types/Result';

export interface IProductService {
  getProductById(id: string): Promise<Result<any, CommerceError>>;
  searchProducts(query: string, filters?: any): Promise<Result<any[], CommerceError>>;
  getProductsByCategory(categoryId: string): Promise<Result<any[], CommerceError>>;
}
