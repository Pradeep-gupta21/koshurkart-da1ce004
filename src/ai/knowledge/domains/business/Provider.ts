import { BaseDomain } from '../../core/BaseDomain';
import { BUSINESS_RULES } from './data';

export class BusinessDomain extends BaseDomain {
  public readonly name = 'business';
  public readonly description = 'Information about KoshurKart business rules, shipping, returns, etc.';

  constructor() {
    super();
    this.registerNode({
      id: 'business-rules-main',
      title: 'Business Rules Knowledge',
      content: BUSINESS_RULES,
      metadata: { tags: ['business', 'shipping', 'returns', 'policies', 'rules'] }
    });
  }
}
