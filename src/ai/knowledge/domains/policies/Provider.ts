import { BaseDomain } from '../../core/BaseDomain';
import { BRAND_KNOWLEDGE } from './data';

export class PoliciesDomain extends BaseDomain {
  public readonly name = 'policies';
  public readonly description = 'Information about KoshurKart brand, mission, vision, and core values';

  constructor() {
    super();
    this.registerNode({
      id: 'policies-brand-main',
      title: 'Brand and Policies Knowledge',
      content: BRAND_KNOWLEDGE,
      metadata: { tags: ['brand', 'mission', 'vision', 'values', 'policies'] }
    });
  }
}
