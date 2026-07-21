import { ServiceFactory } from '@/services/commerce/di/ServiceFactory';
import { KnowledgeNode } from '../types';
import { Product } from '@/types';

export class ProductKnowledgeService {
  private productService = ServiceFactory.getProductService();

  public async searchProducts(query: string, limit: number = 5): Promise<KnowledgeNode<Product>[]> {
    const result = await this.productService.searchProducts(query);
    if (!result.success) return [];
    
    const products = result.value.slice(0, limit);
    return products.map(p => this.mapToKnowledgeNode(p));
  }
  
  public async getProductDetails(id: string): Promise<KnowledgeNode<Product> | null> {
    const result = await this.productService.getProductById(id);
    if (!result.success) return null;
    
    return this.mapToKnowledgeNode(result.value);
  }

  private mapToKnowledgeNode(product: Product): KnowledgeNode<Product> {
    return {
      id: `product_${product.id}`,
      title: product.title,
      content: product,
      metadata: {
        description: product.description,
        tags: ['product', product.category, product.vendor_id].filter(Boolean),
        keywords: [product.title, product.category].filter(Boolean)
      }
    };
  }
}
