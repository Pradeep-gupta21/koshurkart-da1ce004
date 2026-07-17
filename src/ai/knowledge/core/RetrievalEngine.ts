import { DomainRegistry } from './DomainRegistry';
import { KnowledgeQuery, QueryResult, KnowledgeNode, IKnowledgeDomain } from '../types';

interface ParsedQuery {
  originalIntent: string;
  keywords: string[];
  tags: string[];
  domains: string[];
}

interface MatchContext {
  titleHits: number;
  keywordHits: number;
  tagHits: number;
  descriptionHits: number;
  contentHits: number;
}

interface ScoredNode {
  node: KnowledgeNode;
  domain: string;
  score: number;
}

export class RetrievalEngine {
  // Weights defined by deterministic ranking rules: Title > Keywords > Tags > Description > Content
  private static readonly WEIGHTS = {
    TITLE: 5,
    KEYWORDS: 4,
    TAGS: 3,
    DESCRIPTION: 2,
    CONTENT: 1
  };

  /**
   * 1. Query parser
   * Deterministically normalizes and tokenizes the query into lowercase keywords.
   */
  private parseQuery(q: KnowledgeQuery): ParsedQuery {
    const intentStr = q.intent || '';
    // Tokenize by word boundaries, lowercased, filtering empty/short tokens
    const tokens = intentStr
      .toLowerCase()
      .split(/\W+/)
      .filter(token => token.trim().length > 1);

    // Deduplicate
    const keywords = Array.from(new Set(tokens));

    return {
      originalIntent: intentStr,
      keywords,
      tags: q.tags || [],
      domains: q.domains || []
    };
  }

  /**
   * 2. Domain selection logic
   * Retrieves domains specified in the query, or all if none specified.
   */
  private selectDomains(parsed: ParsedQuery, registry: DomainRegistry): IKnowledgeDomain[] {
    if (parsed.domains && parsed.domains.length > 0) {
      return parsed.domains
        .map(d => registry.getDomain(d))
        .filter((d): d is IKnowledgeDomain => d !== undefined);
    }
    return registry.getAllDomains();
  }

  /**
   * 3. Keyword matching
   * Checks for strict text matches in the node's fields.
   */
  private matchKeywords(parsed: ParsedQuery, node: KnowledgeNode): MatchContext {
    const hits: MatchContext = {
      titleHits: 0,
      keywordHits: 0,
      tagHits: 0,
      descriptionHits: 0,
      contentHits: 0
    };

    if (parsed.keywords.length === 0 && parsed.tags.length === 0) {
      return hits;
    }

    const titleLower = node.title.toLowerCase();
    const contentStr = typeof node.content === 'string'
      ? node.content.toLowerCase()
      : JSON.stringify(node.content).toLowerCase();

    const descLower = node.metadata?.description?.toLowerCase() || '';
    const nodeKeywords = (node.metadata?.keywords || []).map(k => k.toLowerCase());
    const nodeTags = (node.metadata?.tags || []).map(t => t.toLowerCase());

    for (const kw of parsed.keywords) {
      // Title
      if (titleLower.includes(kw)) hits.titleHits++;
      // Description
      if (descLower.includes(kw)) hits.descriptionHits++;
      // Content
      if (contentStr.includes(kw)) hits.contentHits++;
      // Keywords array
      if (nodeKeywords.some(nk => nk.includes(kw))) hits.keywordHits++;
    }

    // Tag matching (exact match with query tags)
    for (const qt of parsed.tags) {
      const tagLower = qt.toLowerCase();
      if (nodeTags.includes(tagLower)) hits.tagHits++;
    }

    return hits;
  }

  /**
   * 4. Metadata scoring
   * Calculates a deterministic relevance score using mathematical weights.
   */
  private scoreMetadata(hits: MatchContext): number {
    return (
      hits.titleHits * RetrievalEngine.WEIGHTS.TITLE +
      hits.keywordHits * RetrievalEngine.WEIGHTS.KEYWORDS +
      hits.tagHits * RetrievalEngine.WEIGHTS.TAGS +
      hits.descriptionHits * RetrievalEngine.WEIGHTS.DESCRIPTION +
      hits.contentHits * RetrievalEngine.WEIGHTS.CONTENT
    );
  }

  /**
   * 5. Retrieval ranking
   * Sorts the nodes descending by score.
   */
  private rankResults(scored: ScoredNode[]): ScoredNode[] {
    return scored.sort((a, b) => b.score - a.score);
  }

  /**
   * 6. Context assembly
   * Formats into QueryResult and limits by topK.
   */
  private assembleContext(ranked: ScoredNode[], topK?: number): QueryResult[] {
    const limited = topK && topK > 0 ? ranked.slice(0, topK) : ranked;
    return limited.map(s => ({
      nodeId: s.node.id,
      domain: s.domain,
      content: s.node.content,
      relevanceScore: s.score
    }));
  }

  /**
   * 7. Retrieval service
   * Orchestrates the full retrieval pipeline.
   */
  public execute(q: KnowledgeQuery, registry: DomainRegistry): QueryResult[] {
    const parsed = this.parseQuery(q);
    const domainsToSearch = this.selectDomains(parsed, registry);
    
    const scoredNodes: ScoredNode[] = [];

    for (const domain of domainsToSearch) {
      const nodes = domain.getAll();
      for (const node of nodes) {
        const hits = this.matchKeywords(parsed, node);
        const score = this.scoreMetadata(hits);
        
        // Only include nodes that matched something or if it's a completely blank query (baseline fallback)
        if (score > 0 || (parsed.keywords.length === 0 && parsed.tags.length === 0)) {
          scoredNodes.push({
            node,
            domain: domain.name,
            score
          });
        }
      }
    }

    const ranked = this.rankResults(scoredNodes);
    return this.assembleContext(ranked, q.topK);
  }
}
