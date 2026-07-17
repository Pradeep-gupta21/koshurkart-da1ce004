import { BaseDomain } from '../../core/BaseDomain';
import { VENDOR_KNOWLEDGE } from './data';

export class ArtisansDomain extends BaseDomain {
  public readonly name = 'artisans';
  public readonly description = 'Information about KoshurKart artisans, vendors, and onboarding';

  constructor() {
    super();
    this.registerNode({
      id: 'artisans-main',
      title: 'Artisans and Vendors Knowledge',
      content: VENDOR_KNOWLEDGE,
      metadata: { tags: ['artisans', 'vendors', 'kyc', 'onboarding'] }
    });
  }
}
