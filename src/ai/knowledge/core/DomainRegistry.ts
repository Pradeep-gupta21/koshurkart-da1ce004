import { IKnowledgeDomain } from '../types';

/**
 * Registry for managing all active knowledge domains.
 * Allows dynamic registration and retrieval of domains.
 */
export class DomainRegistry {
  private domains: Map<string, IKnowledgeDomain> = new Map();

  /**
   * Registers a new knowledge domain.
   */
  public register(domain: IKnowledgeDomain): void {
    if (this.domains.has(domain.name)) {
      console.warn(`[KnowledgeEngine] Domain ${domain.name} is already registered. Overwriting.`);
    }
    this.domains.set(domain.name, domain);
  }

  /**
   * Retrieves a domain by its name.
   */
  public getDomain(name: string): IKnowledgeDomain | undefined {
    return this.domains.get(name);
  }

  /**
   * Retrieves all registered domains.
   */
  public getAllDomains(): IKnowledgeDomain[] {
    return Array.from(this.domains.values());
  }
}
