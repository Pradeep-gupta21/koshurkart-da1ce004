import { ProductKnowledgeService } from './ProductKnowledgeService';
import { VendorKnowledgeService } from './VendorKnowledgeService';
import { CategoryKnowledgeService } from './CategoryKnowledgeService';
import { KnowledgeNode, KnowledgeQuery, QueryResult } from '../types';

export class KnowledgeAggregator {
  private productService = new ProductKnowledgeService();
  private vendorService = new VendorKnowledgeService();
  private categoryService = new CategoryKnowledgeService();

  public async queryAsync(q: KnowledgeQuery): Promise<QueryResult[]> {
    const results: QueryResult[] = [];
    const intentStr = q.intent || '';
    
    if (intentStr) {
      const products = await this.productService.searchProducts(intentStr);
      results.push(...this.mapToQueryResults(products, 'products'));

      const categories = await this.categoryService.searchCategories(intentStr);
      results.push(...this.mapToQueryResults(categories, 'categories'));
    }

    // Include vendors if explicitly requested or if no specific intent is provided
    if (q.domains?.includes('artisans') || !intentStr) {
      const vendors = await this.vendorService.getVendorSummaries();
      // For phase 1, we just return a limited subset so we don't blow up context limits
      const limitedVendors = vendors.slice(0, 5); 
      results.push(...this.mapToQueryResults(limitedVendors, 'artisans'));
    }
    
    // Include all categories if no intent is provided
    if (!intentStr) {
       const categories = await this.categoryService.getCategoryMetadata();
       results.push(...this.mapToQueryResults(categories, 'categories'));
    }

    // Sort by a mock relevance if needed, though services might return ordered results
    return results;
  }

  private mapToQueryResults(nodes: KnowledgeNode[], domain: string): QueryResult[] {
    return nodes.map(node => ({
      nodeId: node.id,
      domain,
      content: node.content,
      relevanceScore: 1 // Baseline score for dynamic retrievals
    }));
  }
}
