import { DomainRegistry } from './DomainRegistry';
import { KnowledgeQuery, QueryResult } from '../types';
import { RetrievalEngine } from './RetrievalEngine';
import { KnowledgeAggregator } from '../services/KnowledgeAggregator';

/**
 * The central manager for accessing all knowledge across Koshur AI.
 * Abstracts the underlying storage and retrieval mechanics.
 */
export class KnowledgeManager {
  private registry: DomainRegistry;
  private retrievalEngine: RetrievalEngine;
  private aggregator: KnowledgeAggregator;

  constructor(registry: DomainRegistry = new DomainRegistry()) {
    this.registry = registry;
    this.retrievalEngine = new RetrievalEngine();
    this.aggregator = new KnowledgeAggregator();
  }

  public getRegistry(): DomainRegistry {
    return this.registry;
  }

  /**
   * Deterministic synchronous query mechanism for static domains.
   * Delegates entirely to the RetrievalEngine.
   */
  public query(q: KnowledgeQuery): QueryResult[] {
    return this.retrievalEngine.execute(q, this.registry);
  }

  /**
   * Asynchronous query mechanism for dynamic commerce knowledge.
   * Delegates to the KnowledgeAggregator.
   */
  public async queryAsync(q: KnowledgeQuery): Promise<QueryResult[]> {
    // Phase 1: Provide basic aggregate functionality for commerce services
    return this.aggregator.queryAsync(q);
  }
}
