import { BaseDomain } from '../../core/BaseDomain';
import { HERITAGE_KNOWLEDGE } from './data';

export class HeritageDomain extends BaseDomain {
  public readonly name = 'heritage';
  public readonly description = 'Information about Kashmir heritage and culture';

  constructor() {
    super();
    this.registerNode({
      id: 'heritage-main',
      title: 'Kashmir Heritage Knowledge',
      content: HERITAGE_KNOWLEDGE,
      metadata: { tags: ['heritage', 'kashmir', 'culture', 'history'] }
    });
  }
}
