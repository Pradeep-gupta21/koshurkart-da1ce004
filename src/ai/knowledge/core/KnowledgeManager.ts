import { DomainRegistry } from './DomainRegistry';
import { KnowledgeQuery, QueryResult, KnowledgeNode } from '../types';

/**
 * The central manager for accessing all knowledge across Koshur AI.
 * Abstracts the underlying storage and retrieval mechanics.
 */
export class KnowledgeManager {
  private registry: DomainRegistry;

  constructor(registry: DomainRegistry = new DomainRegistry()) {
    this.registry = registry;
  }

  public getRegistry(): DomainRegistry {
    return this.registry;
  }

  /**
   * Basic synchronous query mechanism.
   * Future implementations will handle RAG and asynchronous vector search here.
   */
  public query(q: KnowledgeQuery): QueryResult[] {
    const results: QueryResult[] = [];
    
    // Determine which domains to search
    const domainsToSearch = q.domains 
      ? q.domains.map(d => this.registry.getDomain(d)).filter(d => d !== undefined)
      : this.registry.getAllDomains();

    for (const domain of domainsToSearch) {
      if (!domain) continue;

      const nodes = domain.getAll();
      for (const node of nodes) {
        // Very rudimentary matching logic for scaffolding phase.
        // In a real system, this could be regex, NLP, or eventually Vector similarity.
        const matchesIntent = q.intent ? this.nodeMatchesIntent(node, q.intent) : true;
        const matchesTags = q.tags ? this.nodeMatchesTags(node, q.tags) : true;

        if (matchesIntent && matchesTags) {
          results.push({
            nodeId: node.id,
            domain: domain.name,
            content: node.content,
            relevanceScore: 1.0 // Placeholder score
          });
        }
      }
    }

    return results;
  }

  private nodeMatchesIntent(node: KnowledgeNode, intent: string): boolean {
    // Simple substring match for scaffolding purposes
    const target = intent.toLowerCase();
    const titleMatch = node.title.toLowerCase().includes(target);
    const contentMatch = typeof node.content === 'string' 
      ? node.content.toLowerCase().includes(target) 
      : JSON.stringify(node.content).toLowerCase().includes(target);
      
    return titleMatch || contentMatch;
  }

  private nodeMatchesTags(node: KnowledgeNode, requiredTags: string[]): boolean {
    if (!node.metadata?.tags) return false;
    return requiredTags.every(tag => node.metadata!.tags!.includes(tag));
  }
}
