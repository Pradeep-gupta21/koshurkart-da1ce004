import { BaseDomain } from '../../core/BaseDomain';
import { PRODUCT_KNOWLEDGE } from './data';

export class ProductsDomain extends BaseDomain {
  public readonly name = 'products';
  public readonly description = 'Information about KoshurKart products and categories';

  constructor() {
    super();
    this.registerNode({
      id: 'products-main',
      title: 'Products and Categories Knowledge',
      content: PRODUCT_KNOWLEDGE,
      metadata: { tags: ['products', 'categories', 'materials'] }
    });
  }
}
