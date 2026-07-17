/**
 * Represents a basic query or intent matching structure.
 * Future-ready for RAG integration.
 */
export interface KnowledgeQuery {
  /**
   * The core intent or topic being queried.
   */
  intent: string;
  
  /**
   * Specific tags to filter by.
   */
  tags?: string[];
  
  /**
   * Specific domains to restrict the query to.
   */
  domains?: string[];
  
  // Future RAG extensions:
  // similarityThreshold?: number;
  topK?: number;
}

/**
 * The result of a knowledge query.
 */
export interface QueryResult<T = any> {
  nodeId: string;
  domain: string;
  content: T;
  relevanceScore?: number; // Useful for future vector similarity
}
