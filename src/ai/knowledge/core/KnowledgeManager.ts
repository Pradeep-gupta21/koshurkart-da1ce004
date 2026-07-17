import { DomainRegistry } from './DomainRegistry';
import { KnowledgeQuery, QueryResult } from '../types';
import { RetrievalEngine } from './RetrievalEngine';

/**
 * The central manager for accessing all knowledge across Koshur AI.
 * Abstracts the underlying storage and retrieval mechanics.
 */
export class KnowledgeManager {
  private registry: DomainRegistry;
  private retrievalEngine: RetrievalEngine;

  constructor(registry: DomainRegistry = new DomainRegistry()) {
    this.registry = registry;
    this.retrievalEngine = new RetrievalEngine();
  }

  public getRegistry(): DomainRegistry {
    return this.registry;
  }

  /**
   * Deterministic synchronous query mechanism.
   * Delegates entirely to the RetrievalEngine.
   */
  public query(q: KnowledgeQuery): QueryResult[] {
    return this.retrievalEngine.execute(q, this.registry);
  }
}
