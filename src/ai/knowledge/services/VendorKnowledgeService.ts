import { ServiceFactory } from '@/services/commerce/di/ServiceFactory';
import { KnowledgeNode } from '../types';

export class VendorKnowledgeService {
  private productService = ServiceFactory.getProductService();

  public async getVendorInformation(vendorId: string): Promise<KnowledgeNode | null> {
    const result = await this.productService.getVendors();
    if (!result.success) return null;

    const vendor = result.value.find(v => v.id === vendorId);
    if (!vendor) return null;

    return this.mapToKnowledgeNode(vendor);
  }

  public async getVendorSummaries(): Promise<KnowledgeNode[]> {
    const result = await this.productService.getVendors();
    if (!result.success) return [];

    return result.value.map(v => this.mapToKnowledgeNode(v));
  }

  private mapToKnowledgeNode(vendor: any): KnowledgeNode {
    return {
      id: `vendor_${vendor.id}`,
      title: vendor.name || vendor.store_name || 'Unknown Vendor',
      content: vendor,
      metadata: {
        description: vendor.description || vendor.bio || '',
        tags: ['vendor', 'artisan'],
        keywords: [vendor.name, vendor.store_name, vendor.specialty].filter(Boolean)
      }
    };
  }
}
