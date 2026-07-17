import { BaseDomain } from '../../core/BaseDomain';
import { FAQ_KNOWLEDGE, SUPPORT_CHANNELS } from './data';

export class FaqsDomain extends BaseDomain {
  public readonly name = 'faqs';
  public readonly description = 'Information about KoshurKart frequently asked questions and support';

  constructor() {
    super();
    this.registerNode({
      id: 'faqs-main',
      title: 'FAQs Knowledge',
      content: FAQ_KNOWLEDGE,
      metadata: { tags: ['faq', 'questions', 'support'] }
    });
    this.registerNode({
      id: 'faqs-support-channels',
      title: 'Support Channels',
      content: SUPPORT_CHANNELS,
      metadata: { tags: ['support', 'contact'] }
    });
  }
}
