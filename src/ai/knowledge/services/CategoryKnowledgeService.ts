import { ServiceFactory } from '@/services/commerce/di/ServiceFactory';
import { KnowledgeNode } from '../types';

export class CategoryKnowledgeService {
  private productService = ServiceFactory.getProductService();

  public async getCategoryMetadata(): Promise<KnowledgeNode[]> {
    const result = await this.productService.getCategories();
    if (!result.success) return [];

    return result.value.map(c => this.mapToKnowledgeNode(c));
  }

  public async searchCategories(query: string): Promise<KnowledgeNode[]> {
    const result = await this.productService.getCategories();
    if (!result.success) return [];

    const lowerQuery = query.toLowerCase();
    const matched = result.value.filter(c => c.toLowerCase().includes(lowerQuery));
    
    return matched.map(c => this.mapToKnowledgeNode(c));
  }

  private mapToKnowledgeNode(category: string): KnowledgeNode {
    return {
      id: `category_${category.toLowerCase().replace(/\s+/g, '_')}`,
      title: category,
      content: { name: category },
      metadata: {
        description: `Category for ${category}`,
        tags: ['category'],
        keywords: [category]
      }
    };
  }
}
